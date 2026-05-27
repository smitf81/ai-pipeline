# AXIOM SSE Bridge v0

Tiny Server-Sent Events bridge for AXIOM / ACE experiments.

## Install

```bash
npm install
npm start
```

Server runs on:

```txt
http://localhost:3007
```

Demo page:

```txt
http://localhost:3007/sse-demo.html
```

## Add to AXIOM .html launcher

Add this before `</body>`:

```html
<script src="http://localhost:3007/axiom-sse-client.js"></script>
<script>
  window.addEventListener("DOMContentLoaded", () => {
    AXIOMSSE.connect();
  });
</script>
```

## Send a test intent

From the demo page or browser console:

```js
AXIOMSSE.sendIntent("Make the northern forest more dangerous but still passable");
```

## Send an ACE event into AXIOM

```bash
curl -X POST http://localhost:3007/events \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"ace_event\",\"data\":{\"text\":\"ACE says hello\"}}"
```

PowerShell:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3007/events" -ContentType "application/json" -Body '{"event":"ace_event","data":{"text":"ACE says hello"}}'
```

## What this is

A live cognitive stream spine.

Good event types:

- `thought`
- `status`
- `kernel_delta_proposed`
- `kernel_delta`
- `validation`
- `ace_event`
- `mcp_event`

## What this is not

This is not the full LUMA/MYCEL language.
This is not the final ACE/Axiom protocol.
This is the first live transport seam.
