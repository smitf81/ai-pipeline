import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { registerSSE, broadcast, getClientCount } from "./server/sse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

registerSSE(app);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "axiom-sse-bridge",
    clients: getClientCount(),
    time: new Date().toISOString()
  });
});

/**
 * AXIOM / ACE / MCP can POST structured events here.
 * Keep these events small and typed.
 */
app.post("/events", (req, res) => {
  const { event = "status", data = {} } = req.body || {};

  broadcast(event, {
    ...data,
    receivedAt: new Date().toISOString()
  });

  res.json({ ok: true, event });
});

/**
 * First LUMA-ish intent endpoint.
 * This does NOT pretend to be smart yet.
 * It turns one human request into a proposed kernel delta event.
 */
app.post("/intent", (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (!text) {
    return res.status(400).json({ ok: false, error: "Missing text" });
  }

  broadcast("thought", {
    agent: "intent_compiler",
    text: `Interpreting: ${text}`
  });

  const lower = text.toLowerCase();

  const region =
    lower.includes("north") || lower.includes("northern")
      ? "northern_forest"
      : "current_focus_region";

  const operations = [];

  if (lower.includes("danger") || lower.includes("threat") || lower.includes("threatening")) {
    operations.push({
      op: "field.adjust",
      field: "danger",
      region,
      amount: 0.2
    });
  }

  if (lower.includes("passable") || lower.includes("traversable")) {
    operations.push({
      op: "constraint.preserve",
      constraint: "traversal.passable",
      region
    });
  }

  if (operations.length === 0) {
    operations.push({
      op: "intent.note",
      note: text,
      region
    });
  }

  const delta = {
    delta_id: `delta_${Date.now()}`,
    source: "luma_input",
    intent_text: text,
    target: { type: "region", id: region },
    operations,
    status: "proposed",
    createdAt: new Date().toISOString()
  };

  broadcast("kernel_delta_proposed", delta);

  broadcast("status", {
    phase: "delta_proposed",
    summary: `${operations.length} operation(s) proposed`
  });

  res.json({ ok: true, delta });
});

/**
 * Dev/demo heartbeat.
 * Useful to prove the stream works before wiring real agents.
 */
setInterval(() => {
  if (getClientCount() > 0) {
    broadcast("heartbeat", {
      service: "axiom-sse-bridge",
      clients: getClientCount()
    });
  }
}, 10000);

app.listen(PORT, () => {
  console.log(`AXIOM SSE Bridge running at http://localhost:${PORT}`);
  console.log(`Demo page: http://localhost:${PORT}/sse-demo.html`);
});
