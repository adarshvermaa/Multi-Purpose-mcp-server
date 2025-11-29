// app.ts (patch)
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { main } from "tcp/uses";
import { loadRoutes } from "utils/loadRoutes";
import { KafkaManager } from "./kafka/kafkaManager";
import { SocketManager } from "./socket/socketManager";

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "*",
  })
);

// JSON middleware (move earlier)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "20mb" })); // or larger

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const kafkaClientId = process.env.KAFKA_CLIENT_ID || "my-app";
const kafkaGroupId = process.env.KAFKA_GROUP_ID || "my-group";

// instantiate managers
const kafkaManager = new KafkaManager(brokers, kafkaClientId, kafkaGroupId);

const socketManager = new SocketManager(server, kafkaManager, {
  kafkaTopicPrefix: "socket.events",
});

// Import and setup editor socket handlers
import { setupEditorSocketHandlers } from './socket/editorSocketHandlers';
setupEditorSocketHandlers(socketManager.io);

const PORT = process.env.SERVER_PORT || 5001;

async function start() {
  try {
    // start kafka consumer/manager so subscriptions work as expected
    await kafkaManager.start();
    console.log("[app] kafkaManager started");

    // expose socket.io instance globally so other utilities (aiClient) can emit
    (global as any).__expressIoInstance = socketManager.io;

    // Bind topics (SocketManager.bindKafkaTopicToSockets uses kafkaManager.subscribe)
    // Do this after kafkaManager.start(); it will subscribe handlers and restart consumer as needed.
    await socketManager.bindKafkaTopics([
      "socket.events.chat.message",
      "socket.events.broadcast",
      // add other topics you want to forward on startup
    ]);

    // initialize other application pieces
    await main();
    
    // Serve static files from web directory
    const webPath = path.resolve(__dirname, '../../web');
    app.use(express.static(webPath));
    console.log(`[app] Serving static files from: ${webPath}`);
    
    await loadRoutes(app);

    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });

    const shutdown = async () => {
      console.log("Shutting down...");
      try {
        await socketManager.close();
      } catch (e) {
        console.warn("socketManager.close error", e);
      }
      try {
        await kafkaManager.disconnect();
      } catch (e) {
        console.warn("kafkaManager.disconnect error", e);
      }
      server.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error("Startup error", err);
    process.exit(1);
  }
}

start();
