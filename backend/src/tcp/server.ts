import net from "net";
import { TcpMessage } from "./types";

export class TcpServer {
  private server: net.Server;
  private port: number;
  private host: string;

  constructor(port: number, host: string = "localhost") {
    this.port = port;
    this.host = host;
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  private handleConnection(socket: net.Socket): void {
    console.log(
      `New connection from ${socket.remoteAddress}:${socket.remotePort}`
    );

    socket.on("data", (data: Buffer) => {
      try {
        const message: TcpMessage = JSON.parse(data.toString());
        console.log(`Received event '${message.event}': ${message.data}`);

        // Respond based on event type
        const response: TcpMessage = {
          event: message.event,
          data: `Server processed ${message.event}: ${message.data}`,
          timestamp: Date.now(),
        };

        if (message.event === "ping") {
          response.data = "pong";
        } else if (message.event === "status") {
          response.data = "Server is running";
        }

        socket.write(JSON.stringify(response));
      } catch (err) {
        console.error("Error parsing client data:", err);
        socket.write(
          JSON.stringify({
            event: "error",
            data: "Invalid message format",
            timestamp: Date.now(),
          })
        );
      }
    });

    socket.on("end", () => {
      console.log(
        `Client ${socket.remoteAddress}:${socket.remotePort} disconnected`
      );
      socket.write(
        JSON.stringify({
          event: "close",
          data: "Connection closed",
          timestamp: Date.now(),
        })
      );
    });

    socket.on("error", (err: Error) => {
      console.error(`Socket error: ${err.message}`);
      socket.write(
        JSON.stringify({
          event: "error",
          data: `Server error: ${err.message}`,
          timestamp: Date.now(),
        })
      );
    });

    // Send welcome event on connection
    socket.write(
      JSON.stringify({
        event: "connect",
        data: "Welcome to the TCP server",
        timestamp: Date.now(),
      })
    );
  }

  public start(): void {
    this.server.listen(this.port, this.host, () => {
      console.log(`Server listening on ${this.host}:${this.port}`);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
