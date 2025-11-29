import net from "net";
import { TcpMessage, TcpClientOptions } from "./types";

type EventCallback = (message: TcpMessage) => void;

export class TcpClient {
  private client: net.Socket;
  private host: string;
  private port: number;
  private eventListeners: Map<string, EventCallback[]>;

  constructor(options: TcpClientOptions) {
    this.port = options.port;
    this.host = options.host || "localhost";
    this.client = new net.Socket();
    this.eventListeners = new Map();

    // Set up data listener
    this.client.on("data", (data: Buffer) => {
      try {
        const message: TcpMessage = JSON.parse(data.toString());
        console.log(`Received event '${message.event}': ${message.data}`);
        const listeners = this.eventListeners.get(message.event) || [];
        listeners.forEach((callback) => callback(message));
      } catch (err: any) {
        console.error("Error parsing server response:", err);
        const errorMessage: TcpMessage = {
          event: "error",
          data: `Parse error: ${err.message}`,
          timestamp: Date.now(),
        };
        const errorListeners = this.eventListeners.get("error") || [];
        errorListeners.forEach((callback) => callback(errorMessage));
      }
    });

    this.client.on("close", () => {
      console.log("Connection closed");
      const closeMessage: TcpMessage = {
        event: "close",
        data: "Connection closed",
        timestamp: Date.now(),
      };
      const closeListeners = this.eventListeners.get("close") || [];
      closeListeners.forEach((callback) => callback(closeMessage));
    });
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.connect(this.port, this.host, () => {
        console.log(`Connected to server ${this.host}:${this.port}`);
        resolve();
      });

      this.client.on("error", (err: Error) => {
        console.error(`Client error: ${err.message}`);
        const errorMessage: TcpMessage = {
          event: "error",
          data: `Client error: ${err.message}`,
          timestamp: Date.now(),
        };
        const errorListeners = this.eventListeners.get("error") || [];
        errorListeners.forEach((callback) => callback(errorMessage));
        reject(err);
      });
    });
  }

  public send(event: string, data: string): Promise<TcpMessage> {
    return new Promise((resolve, reject) => {
      const message: TcpMessage = { event, data, timestamp: Date.now() };
      const dataHandler = (data: Buffer) => {
        try {
          const response: TcpMessage = JSON.parse(data.toString());
          if (response.event === message.event || response.event === "error") {
            this.client.off("data", dataHandler);
            resolve(response);
          }
        } catch (err) {
          this.client.off("data", dataHandler);
          reject(err);
        }
      };

      this.client.on("data", dataHandler);
      this.client.write(JSON.stringify(message));
    });
  }

  public on(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);
  }

  public off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event) || [];
    this.eventListeners.set(
      event,
      listeners.filter((cb) => cb !== callback)
    );
  }

  public disconnect(): void {
    this.client.end();
  }
}
