/**
 * Drop this into your AXIOM .html file:
 *
 * <script src="http://localhost:3007/axiom-sse-client.js"></script>
 *
 * Then call:
 *   AXIOMSSE.connect();
 *   AXIOMSSE.sendIntent("Make the northern forest more dangerous but still passable");
 */
window.AXIOMSSE = (() => {
  let source = null;
  let feed = null;
  const bridgeUrl = "http://localhost:3007";

  function ensureFeed() {
    if (feed) return feed;

    feed = document.getElementById("axiom-runtime-feed");

    if (!feed) {
      feed = document.createElement("div");
      feed.id = "axiom-runtime-feed";
      feed.innerHTML = `
        <div class="axiom-runtime-feed-title">AXIOM COGNITIVE STREAM</div>
        <div id="axiom-runtime-feed-rows"></div>
      `;
      document.body.appendChild(feed);
      injectStyle();
    }

    return feed;
  }

  function injectStyle() {
    if (document.getElementById("axiom-sse-style")) return;
    const style = document.createElement("style");
    style.id = "axiom-sse-style";
    style.textContent = `
      #axiom-runtime-feed {
        position: fixed;
        left: 12px;
        bottom: 32px;
        z-index: 9999;
        width: 430px;
        max-height: 260px;
        overflow: auto;
        background: rgba(8, 8, 12, 0.88);
        border: 1px solid rgba(124, 92, 252, 0.45);
        color: #d8dcff;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
        padding: 8px 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        backdrop-filter: blur(8px);
      }
      .axiom-runtime-feed-title {
        color: #7c5cfc;
        font-weight: 700;
        letter-spacing: 0.12em;
        margin-bottom: 6px;
      }
      .axiom-stream-row {
        border-top: 1px solid rgba(255,255,255,0.06);
        padding: 5px 0;
        line-height: 1.45;
      }
      .axiom-stream-event {
        color: #3dffa0;
        margin-right: 6px;
      }
      .axiom-stream-muted {
        color: #7c819d;
      }
    `;
    document.head.appendChild(style);
  }

  function addRuntimeEvent(eventName, data) {
    ensureFeed();
    const rows = document.getElementById("axiom-runtime-feed-rows");
    const row = document.createElement("div");
    row.className = "axiom-stream-row";

    const label = document.createElement("span");
    label.className = "axiom-stream-event";
    label.textContent = `[${eventName}]`;

    const body = document.createElement("span");
    body.textContent = formatPayload(data);

    row.appendChild(label);
    row.appendChild(body);
    rows.prepend(row);
  }

  function formatPayload(data) {
    if (!data) return "";
    if (typeof data === "string") return data;
    if (data.text) return data.agent ? `${data.agent}: ${data.text}` : data.text;
    if (data.summary) return data.summary;
    if (data.delta_id) {
      return `${data.delta_id} → ${data.operations?.map(op => op.op).join(", ") || "no ops"}`;
    }
    return JSON.stringify(data);
  }

  function connect(url = `${bridgeUrl}/axiom-stream`) {
    if (source) source.close();

    ensureFeed();
    addRuntimeEvent("client", { text: `Connecting to ${url}` });

    source = new EventSource(url);

    const eventTypes = [
      "system",
      "heartbeat",
      "thought",
      "status",
      "kernel_delta",
      "kernel_delta_proposed",
      "validation",
      "agent_event",
      "ace_event",
      "mcp_event"
    ];

    for (const type of eventTypes) {
      source.addEventListener(type, (e) => {
        try {
          const data = JSON.parse(e.data);
          addRuntimeEvent(type, data);

          window.dispatchEvent(new CustomEvent(`axiom:sse:${type}`, {
            detail: data
          }));
        } catch (err) {
          addRuntimeEvent("parse_error", { text: err.message });
        }
      });
    }

    source.onerror = () => {
      addRuntimeEvent("stream_error", {
        text: "SSE disconnected or bridge offline"
      });
    };

    return source;
  }

  async function sendIntent(text) {
    const res = await fetch(`${bridgeUrl}/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function sendEvent(event, data) {
    const res = await fetch(`${bridgeUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data })
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  return {
    connect,
    sendIntent,
    sendEvent,
    addRuntimeEvent
  };
})();
