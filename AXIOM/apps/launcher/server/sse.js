const clients = new Set();

export function registerSSE(app) {
  app.get("/axiom-stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no"
    });

    const client = { res, connectedAt: new Date().toISOString() };
    clients.add(client);

    sendEvent(res, "system", {
      text: "AXIOM cognitive stream connected",
      connectedAt: client.connectedAt
    });

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(client);
    });
  });
}

export function broadcast(event, data) {
  for (const client of clients) {
    sendEvent(client.res, event, data);
  }
}

export function getClientCount() {
  return clients.size;
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
