import { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";
import { KafkaManager } from "../kafka/kafkaManager";

export type SocketEventPayload = {
  event: string;
  payload: any;
  room?: string; // optional room/namespace to emit to
  socketId?: string; // optional target socket id
};

export class SocketManager {
  public io: IOServer;
  private kafkaManager: KafkaManager;
  private kafkaTopicPrefix: string;

  constructor(
    httpServer: HttpServer,
    kafkaManager: KafkaManager,
    options?: { cors?: any; kafkaTopicPrefix?: string }
  ) {
    this.io = new IOServer(httpServer, {
      cors: options?.cors ?? { origin: "*" },
    });
    (global as any).__expressIoInstance = this.io;
    this.kafkaManager = kafkaManager;
    this.kafkaTopicPrefix =
      options?.kafkaTopicPrefix ??
      process.env.SOCKET_EVENT_TO_KAFKA_PREFIX ??
      "socket.events";
    this.setupConnectionHandler();
  }

  private setupConnectionHandler() {
    this.io.on("connection", (socket) => {
      console.log(`[SocketManager] client connected: ${socket.id}`);

      // Client emits a generic event that we publish to Kafka
      socket.on("event_to_server", async (msg: SocketEventPayload) => {
        try {
          if (!msg || !msg.event) {
            console.warn(
              "[SocketManager] invalid event_to_server payload",
              msg
            );
            return;
          }

          const eventName = msg.event;
          const payload = msg.payload ?? null;
          const room = msg.room;

          // publish to kafka topic derived from event name
          const topic = `${this.kafkaTopicPrefix}.${eventName.replace(
            /\s+/g,
            "_"
          )}`;

          await this.kafkaManager.publish(topic, {
            event: eventName,
            payload,
            socketId: socket.id,
            room,
            ts: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[SocketManager] publish error", err);
        }
      });

      // convenience: allow clients to join/leave rooms
      socket.on("join", (room: string) => {
        try {
          socket.join(room);
        } catch (e) {
          console.warn("[SocketManager] join room error", e);
        }
      });
      socket.on("leave", (room: string) => {
        try {
          socket.leave(room);
        } catch (e) {
          console.warn("[SocketManager] leave room error", e);
        }
      });

      // Editor-specific events
      socket.on('editor:chat_message', async (data: any) => {
        try {
          console.log(`[SocketManager] editor:chat_message from ${socket.id}`);
          // Forward to AI service (will be handled by external service or controller)
          socket.emit('editor:chat_received', { messageId: data.messageId || Date.now() });
        } catch (err) {
          console.error('[SocketManager] editor:chat_message error', err);
          socket.emit('editor:error', { message: 'Failed to process chat message' });
        }
      });

      socket.on('editor:select_component', (data: any) => {
        console.log(`[SocketManager] component selected: ${data.componentIds}`);
        // Broadcast to other clients in the same room if needed
        if (data.room) {
          socket.to(data.room).emit('editor:component_selected', data);
        }
      });

      socket.on('editor:update_component', (data: any) => {
        console.log(`[SocketManager] component updated: ${data.componentId}`);
        if (data.room) {
          socket.to(data.room).emit('editor:component_updated', data);
        }
      });

      socket.on('editor:apply_code', (data: any) => {
        console.log(`[SocketManager] applying code for message: ${data.messageId}`);
        socket.emit('editor:code_applied', { messageId: data.messageId });
      });

      socket.on("disconnect", (reason) => {
        console.log(
          `[SocketManager] client disconnected: ${socket.id} reason=${reason}`
        );
      });
    });
  }

  /**
   * Emit to all clients, a room, or a single socket depending on message.
   */
  emitByKafkaMessage(message: SocketEventPayload) {
    if (!message || !message.event) {
      console.warn(
        "[SocketManager] emitByKafkaMessage called with invalid message",
        message
      );
      return;
    }

    if (message.socketId) {
      // socket.io v4: this.io.sockets.sockets is a Map of sockets
      const s = (this.io.sockets.sockets as any).get(message.socketId);
      if (s) {
        s.emit(message.event, message.payload);
      } else {
        console.warn(
          "[SocketManager] target socket not connected",
          message.socketId
        );
      }
      return;
    }

    if (message.room) {
      this.io.to(message.room).emit(message.event, message.payload);
      return;
    }

    // broadcast to all
    this.io.emit(message.event, message.payload);
  }

  /**
   * Subscribe to a single kafka topic and forward messages to sockets.
   * Assumes KafkaManager.subscribe(topic, handler) provides handler with:
   *   (msg: { topic, partition, key, value, headers })
   */
  async bindKafkaTopicToSockets(topic: string) {
    await this.kafkaManager.subscribe(topic, async (kmsg) => {
      try {
        const val = (kmsg as any).value;
        if (!val) return;

        // If value is a JSON string, parse it. If already object, use it.
        let payloadObj: any = val;
        if (typeof val === "string") {
          try {
            payloadObj = JSON.parse(val);
          } catch (e) {
            console.warn(
              "[SocketManager] kafka message value is string but JSON.parse failed",
              e
            );
            return;
          }
        }

        // basic validation of payload shape
        if (!payloadObj.event) {
          console.warn("[SocketManager] kafka message missing `event` field", {
            topic,
            payloadObj,
          });
          return;
        }

        // forward to socket(s)
        this.emitByKafkaMessage(payloadObj as SocketEventPayload);
      } catch (err) {
        console.error("[SocketManager] error handling kafka message", err);
      }
    });
  }

  /**
   * Bind many topics (useful for startup)
   */
  async bindKafkaTopics(topics: string[]) {
    for (const t of topics) {
      try {
        await this.bindKafkaTopicToSockets(t);
      } catch (e) {
        console.error(`[SocketManager] failed to bind kafka topic ${t}`, e);
      }
    }
  }

  /** Emit directly to kafka from server-side code for given event */
  async publishEventToKafka(
    event: string,
    payload: any,
    room?: string,
    socketId?: string
  ) {
    const topic = `${this.kafkaTopicPrefix}.${event.replace(/\s+/g, "_")}`;
    await this.kafkaManager.publish(topic, {
      event,
      payload,
      room,
      socketId,
      ts: new Date().toISOString(),
    });
  }

  /** Graceful close */
  async close() {
    try {
      await this.io.close();
    } catch (e) {
      console.warn("SocketManager close error", e);
    }
  }
}
