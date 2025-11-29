// src/kafka/kafkaManager.ts
import {
  Kafka,
  Producer,
  Consumer,
  EachMessagePayload,
  logLevel,
} from "kafkajs";

type KafkaMessage = {
  topic: string;
  partition: number;
  key?: string | null;
  value: any;
  headers?: Record<string, any> | undefined;
};

export type KafkaMessageHandler = (
  payload: KafkaMessage
) => Promise<void> | void;

export class KafkaManager {
  private kafka: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;

  // registry
  private handlers = new Map<string, KafkaMessageHandler[]>();
  private topics = new Set<string>();

  // state flags
  private running = false;
  private restarting = false;
  private restartTimeout?: NodeJS.Timeout;

  constructor(
    private brokers: string[],
    private clientId = "app",
    private groupId = "app-group"
  ) {
    this.kafka = new Kafka({
      clientId: clientId,
      brokers,
      logLevel: logLevel.NOTHING,
    });
  }

  /* ---------- Producer helpers ---------- */
  async connectProducer() {
    if (this.producer) return this.producer;
    this.producer = this.kafka.producer();
    await this.producer.connect();
    return this.producer;
  }

  async publish(
    topic: string,
    value: any,
    key?: string,
    headers?: Record<string, string>
  ) {
    const prod = await this.connectProducer();
    await prod.send({
      topic,
      messages: [
        {
          key,
          value: typeof value === "string" ? value : JSON.stringify(value),
          headers,
        },
      ],
    });
  }

  /* ---------- Consumer lifecycle & handlers ---------- */

  // Register handler and ensure the topic is subscribed
  // This function does NOT call consumer.subscribe() directly while consumer.run is active.
  async subscribe(topic: string, handler: KafkaMessageHandler) {
    // register handler
    if (!this.handlers.has(topic)) this.handlers.set(topic, []);
    this.handlers.get(topic)!.push(handler);

    // track topic
    this.topics.add(topic);

    // if not running yet, just return — start() will subscribe to all topics
    if (!this.running && !this.consumer) {
      // not started: do nothing, user must call start()
      return;
    }

    // If consumer is running, we need to restart it to pick up new subscription.
    // Debounce multiple subscribe() calls to avoid frequent restarts.
    this.scheduleRestart();
  }

  // Schedule restart (debounced to avoid thrash)
  private scheduleRestart(delayMs = 500) {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      this.restartConsumer().catch((err) => {
        console.error("[KafkaManager] restartConsumer failed", err);
      });
    }, delayMs);
  }

  // Connects consumer and starts run() if not already running. Uses the handlers map to dispatch messages.
  async start() {
    if (this.running) return;
    await this.ensureConsumer();
    await this.runConsumer();
  }

  // Ensure consumer instance exists & connected
  private async ensureConsumer() {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({ groupId: this.groupId });
      await this.consumer.connect();
    }
  }

  // internal: subscribe to all topics tracked in this.topics
  private async subscribeAll() {
    if (!this.consumer) throw new Error("consumer not initialized");
    for (const t of Array.from(this.topics)) {
      // skip if already subscribed? kafkajs might allow repeated subscribe but it's safe to call
      await this.consumer.subscribe({ topic: t, fromBeginning: false });
    }
  }

  // start running the consumer with a single eachMessage that dispatches to registered handlers
  private async runConsumer() {
    if (!this.consumer) throw new Error("consumer not initialized");
    // Do a fresh subscribe to all topics before run
    await this.subscribeAll();

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        const raw = message.value ? message.value.toString() : null;
        let value: any = raw;
        try {
          value = raw ? JSON.parse(raw) : null;
        } catch {
          value = raw;
        }
        const kafkaMsg: KafkaMessage = {
          topic,
          partition,
          key: message.key?.toString() ?? null,
          value,
          headers: message.headers,
        };

        const handlers = this.handlers.get(topic);
        if (!handlers || handlers.length === 0) return;

        // dispatch in parallel but catch errors
        await Promise.all(
          handlers.map(async (h) => {
            try {
              await h(kafkaMsg);
            } catch (err) {
              console.error("[KafkaManager] handler error", err);
            }
          })
        );
      },
    });

    this.running = true;
  }

  // Restart consumer to pick up new subscriptions (stop -> subscribeAll -> run)
  private async restartConsumer() {
    if (this.restarting) return;
    this.restarting = true;
    try {
      if (!this.consumer) {
        await this.ensureConsumer();
      } else {
        try {
          // stop current run before subscribing again
          await this.consumer.stop();
        } catch (e) {
          // ignore stop errors but log
          console.warn(
            "[KafkaManager] warning: error stopping consumer before restart",
            e
          );
        }
      }

      // re-subscribe to all topics and re-run
      await this.subscribeAll();

      await this.consumer?.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, partition, message } = payload;
          const raw = message.value ? message.value.toString() : null;
          let value: any = raw;
          try {
            value = raw ? JSON.parse(raw) : null;
          } catch {
            value = raw;
          }
          const kafkaMsg: KafkaMessage = {
            topic,
            partition,
            key: message.key?.toString() ?? null,
            value,
            headers: message.headers,
          };

          const handlers = this.handlers.get(topic);
          if (!handlers || handlers.length === 0) return;

          await Promise.all(
            handlers.map(async (h) => {
              try {
                await h(kafkaMsg);
              } catch (err) {
                console.error("[KafkaManager] handler error", err);
              }
            })
          );
        },
      });

      this.running = true;
    } finally {
      this.restarting = false;
    }
  }

  // Disconnect (graceful)
  async disconnect() {
    try {
      if (this.consumer) {
        try {
          await this.consumer.stop();
        } catch (e) {
          // ignore
        }
        await this.consumer.disconnect();
      }
    } catch (e) {
      console.warn("[KafkaManager] consumer disconnect error", e);
    }
    try {
      if (this.producer) await this.producer.disconnect();
    } catch (e) {
      console.warn("[KafkaManager] producer disconnect error", e);
    } finally {
      this.running = false;
    }
  }
}
