# Project context bundle

## Project root
C:\Users\felix\Desktop\Blender\send_to_unreal_bridge

## Git
- branch: main
- last commit: 4d47a36 Add brain stem dashboard prototype

## Tree (depth 3, truncated)
```
send_to_unreal_bridge/
  brain-stem-dashboard/
    src/
      components/
        BrainStemGraph.jsx
      data/
        nodes.js
      hooks/
        useGitIntegration.js
      App.jsx
      main.jsx
      styles.css
    index.html
    package-lock.json
    package.json
    README.md
    vite.config.js
  releases/
    backups/
  send_to_unreal_bridge/
    ue_python/
      __init__.py
      bridge_watcher.py
    __init__.py
    agent_mode.py
    blender_addon_send_to_unreal.py
    README.txt
  tests/
    test_autostart.py
    test_texture_detection.py
  README.md
  README_materials.md
```

## Key docs
### README.md
```
# BlenderBridge-Agent
An automated agent to manage patches and updates to a lightweight blender-ue5 bridge

```

### README_materials.md
```
# Blender → Unreal Bridge Materials

This repository contains experimental scripts for moving assets from
Blender into Unreal Engine. The watcher creates a master material and
applies texture maps based on naming conventions when assets are
imported. Texture names are detected using tokens such as `BaseColor`,
`Normal`, and `ORM`.

The Blender add-on writes a JSON manifest alongside each exported FBX.
`bridge_watcher.py` uses this manifest and any textures found in a
`Textures` folder to build a simple material instance.

The `ue_python/bridge_autostart.py` script demonstrates a Python-only
fallback for automatically launching the watcher when the editor starts.
It guards against duplicate processes by using a lock file.

```

### send_to_unreal_bridge/README.txt
```
# Send to Unreal Bridge (Blender ↔ UE5)

This pack gives you a minimal, working round‑trip:

- **Blender Add‑on**: Adds a *Send to Unreal* button that exports selected objects as FBX into a shared folder.
- **UE5 Python Watcher**: Watches that folder; when a new FBX/GLTF appears, UE auto‑imports it into `/Game/Imported/Bridge` and spawns the mesh in the current level.

## Quick Setup

### 1) Blender (Add‑on)
1. Open Blender > `Edit > Preferences > Add-ons > Install...`
2. Pick the file: `blender_addon_send_to_unreal.py`
3. Enable **Send to Unreal (Bridge)**.
4. In the add‑on settings, confirm the Bridge Folder (defaults to `~/UE_Bridge`).

Usage: Select your mesh(es) > `N` panel > **Send to Unreal** tab > click **Send to Unreal**.

### 2) Unreal Engine 5 (Watcher)
1. In UE Editor, enable plugins:
   - **Python Editor Script Plugin**
   - **Editor Scripting Utilities**
   - **DirectoryWatcher** (Built-in)
2. Open `Window > Developer Tools > Output Log` or `Tools > Execute Python Script`.
3. Run the script `ue_python/bridge_watcher.py`.

UE will watch `~/UE_Bridge`. New `.fbx` (or `.glb/.gltf`) files will import to `/Game/Imported/Bridge` and spawn at the origin.

## Notes
- FBX import uses sensible defaults (static mesh, combined, auto collision). Tweak in `bridge_watcher.py > make_fbx_import_ui()`.
- Blender export options (scale, apply transforms, triangulate, selected only) are in the add‑on preferences.
- Files are timestamped to avoid collisions; you can override the asset name in the operator popup or panel.

Happy bridging!
```
