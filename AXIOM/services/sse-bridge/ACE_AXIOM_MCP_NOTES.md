# ACE <> AXIOM <> MCP notes

## What this bridge does

This package gives AXIOM a small Server-Sent Events bridge.

It lets AXIOM receive live structured events:

- `thought`
- `status`
- `kernel_delta_proposed`
- `validation`
- `ace_event`
- `mcp_event`

It also gives AXIOM a first tiny `/intent` endpoint that turns human text into a proposed kernel delta.

This is deliberately small.

## How it works with your .html launcher

Your AXIOM prototype is currently a mostly self-contained HTML app.

That means it can load this client script directly:

```html
<script src="http://localhost:3007/axiom-sse-client.js"></script>
```

Then:

```js
AXIOMSSE.connect();
```

The SSE server stays outside the HTML file.

Your HTML file becomes the visual/editor surface.
The Node server becomes the live runtime/event bridge.

## How it works with ACE

ACE can POST events into AXIOM:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3007/events" -ContentType "application/json" -Body '{"event":"ace_event","data":{"text":"ACE QA cycle completed"}}'
```

Or JavaScript:

```js
await fetch("http://localhost:3007/events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "ace_event",
    data: {
      source: "ace",
      text: "truth kernel updated"
    }
  })
});
```

AXIOM sees that live in the cognitive stream.

## Can MCP help ACE <> AXIOM communication?

Yes. MCP can help, but do not make it the first dependency.

Best split:

### SSE
Use for live UI streaming:

- agent thoughts
- kernel deltas
- validation updates
- ACE status
- runtime events

### MCP
Use for tool-style capabilities:

- "ask ACE for current truth kernel"
- "ask AXIOM for selected object"
- "apply this bounded delta"
- "run QA"
- "fetch current scene graph"
- "write/read files"

So:

```txt
SSE = live nervous system
MCP = callable tool hands
```

Do not replace SSE with MCP.
Use both.

## Best next MCP tools

For ACE exposing to AXIOM:

- `ace_get_truth_kernel`
- `ace_validate_delta`
- `ace_apply_delta`
- `ace_get_qa_posture`
- `ace_get_workspace`

For AXIOM exposing to ACE:

- `axiom_get_scene_graph`
- `axiom_get_selected_entity`
- `axiom_preview_delta`
- `axiom_apply_visual_delta`
- `axiom_get_runtime_events`

## Recommended next step

1. Keep this SSE bridge as the live stream.
2. Wire AXIOM chat submit to POST `/intent`.
3. Show proposed deltas in the runtime feed.
4. Add one apply button later.
5. Then expose ACE/AXIOM state through MCP tools.

Do not build the full language yet.
Build:

```txt
human text -> proposed delta -> live stream -> visible editor feedback
```
