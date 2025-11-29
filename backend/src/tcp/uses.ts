import { withRecall } from "utils/retry";
import { TcpClient } from "./client";
import { TcpServer } from "./server";

export async function main() {
  // Start TCP server
  const TCP_PORT: number = Number(process.env.TCP_SERVER_PORT) || 8080;
  const server = new TcpServer(TCP_PORT);
  server.start();

  // Create TCP client
  const client = new TcpClient({ port: TCP_PORT });

  // Wrap connect and send with retry logic
  const connectWithRetry = withRecall(client.connect.bind(client), {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: 2,
  });

  const sendWithRetry = withRecall(client.send.bind(client), {
    maxAttempts: 3,
    delayMs: 1000,
    backoff: 2,
  });

  try {
    // Connect with retry
    await connectWithRetry();

    // Set up multiple event listeners
    client.on("connect", (message) => {
      console.log(`[Connect Event] ${message.data}`);
    });

    client.on("message", (message) => {
      console.log(`[Message Event] ${message.data}`);
    });

    client.on("ping", (message) => {
      console.log(`[Ping Event] ${message.data}`);
    });

    // client.on("status", (message) => {
    //   console.log(`[Status Event] ${message.data}`);
    // });

    client.on("check", (message) => {
      console.log(`[Status Event] ${message.data}`);
    });

    client.on("error", (message) => {
      console.error(`[Error Event] ${message.data}`);
    });

    client.on("close", (message) => {
      console.log(`[Close Event] ${message.data}`);
    });

    // // Send multiple event types
    // await sendWithRetry("message", "Hello, Server!");
    // await sendWithRetry("ping", "Ping request");
    // await sendWithRetry("status", "Check server status");
    // await sendWithRetry("check", "Check check server status");

    // Send an invalid message to trigger error event
    // await sendWithRetry("invalid", "{malformed json");

    // Disconnect after 2 seconds
    setTimeout(async () => {
      client.disconnect();
      await server.stop();
    }, 2000);
  } catch (error) {
    console.error("Operation failed:", error);
    await server.stop();
  }
}
