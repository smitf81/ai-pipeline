
AXIOM MCP Tool Registry v0.3 Patch

What this adds:
- GET  /mcp/tools
- POST /mcp/call
- POST /scene
- POST /scene/state

Initial tools:
- axiom_get_scene / scene.get
- axiom_get_selected_entity
- axiom_create_object / scene.createObject
- fs_ls, fs_find, fs_cat, fs_grep, fs_jq
- shell_exec is present but disabled by default

How to apply:
1. Stop AXIOM using AXIOM Stop.cmd, or close the launcher/server window.
2. Copy server.js into the root of axiom-launcher-bundle, replacing the old file.
3. Copy public/axiom-editor.html into axiom-launcher-bundle/public, replacing the old file.
4. Launch AXIOM again.

Validation:
1. Open http://127.0.0.1:3007/mcp/tools in the browser.
   Expected: JSON tool list.
2. In AXIOM, open Stream tab and click Refresh.
   Expected: tools appear in MCP Tools dropdown.
3. Quick Call tool: axiom_create_object
   Params:
   {"type":"sphere","position":{"x":2,"y":0.5,"z":0},"select":true}
   Expected: sphere appears, hierarchy updates, stream shows receipt.
4. Chat prompt:
   Add a sphere at x 2 y 0.5 z 0 using the MCP tool. Do not claim success unless the receipt says applied:true.

Notes:
- This is an AXIOM local tool bridge, not full ACE governance yet.
- The object creation tool returns a browser-side clientAction, then the AXIOM client applies it to the Three.js scene.
- That means we now have a real capability contract and receipt, but not yet ACE validation gates.
