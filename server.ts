import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { OutlookAgent } from "./src/agent/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

  app.use(express.json({ limit: "10mb" }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  const agent = new OutlookAgent();
  const clients = new Set<WebSocket>();

  function broadcast(type: string, data: any) {
    const msg = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  agent.on("log", (log) => broadcast("log", log));
  agent.on("state", (state) => broadcast("state", state));

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "state", data: agent.getState(), timestamp: Date.now() }));

    ws.on("close", () => clients.delete(ws));

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "action") {
          const result = await agent.executeAction(msg.action, msg.params);
          ws.send(JSON.stringify({ type: "action_result", action: msg.action, data: result, timestamp: Date.now() }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", data: err.message, timestamp: Date.now() }));
      }
    });
  });

  app.post("/api/agent/start", async (_req, res) => {
    try {
      await agent.start();
      res.json({ success: true, message: "Agent started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agent/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    try {
      const success = await agent.login(email, password);
      res.json({ success, message: success ? "Logged in" : "Login failed - check credentials or 2FA" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agent/check-session", async (_req, res) => {
    try {
      const loggedIn = await agent.checkSession();
      res.json({ loggedIn });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agent/action", async (req, res) => {
    const { action, params } = req.body;
    if (!action) {
      return res.status(400).json({ error: "Action required" });
    }
    try {
      const result = await agent.executeAction(action, params);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agent/run", async (req, res) => {
    const { goal } = req.body;
    if (!goal) {
      return res.status(400).json({ error: "Goal required" });
    }
    res.json({ success: true, message: `Started autonomous run: ${goal}` });
    agent.runAutonomous(goal).catch((err) => {
      broadcast("error", { message: err.message });
    });
  });

  app.post("/api/agent/stop", async (_req, res) => {
    agent.stop();
    res.json({ success: true, message: "Agent stopped" });
  });

  app.get("/api/agent/state", (_req, res) => {
    res.json(agent.getState());
  });

  app.get("/api/agent/screenshot", async (_req, res) => {
    try {
      const buf = await agent.getScreenshot();
      if (buf) {
        res.type("image/jpeg").send(buf);
      } else {
        res.status(404).json({ error: "No screenshot available" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agent/shutdown", async (_req, res) => {
    await agent.shutdown();
    res.json({ success: true, message: "Agent shut down" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Outlook Agent running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

startServer();
