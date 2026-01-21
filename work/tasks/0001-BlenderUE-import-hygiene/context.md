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

## Key files (snippets)

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

### brain-stem-dashboard/package-lock.json
```
{
  "name": "brain-stem-dashboard",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "brain-stem-dashboard",
      "version": "1.0.0",
      "dependencies": {
        "d3": "^7.8.5",
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      },
      "devDependencies": {
        "@vitejs/plugin-react": "^4.0.0",
        "vite": "^4.0.0"
      }
    },
    "node_modules/@ampproject/remapping": {
      "version": "2.3.0",
      "resolved": "https://registry.npmjs.org/@ampproject/remapping/-/remapping-2.3.0.tgz",
      "integrity": "sha512-30iZtAPgz+LTIYoeivqYo853f02jBYSd5uGnGpkFV0M3xOt9aN73erkgYAmZU43x4VfqcnLxW9Kpg3R5LC4YYw==",
      "dev": true,
      "license": "Apache-2.0",
      "dependencies": {
        "@jridgewell/gen-mapping": "^0.3.5",
        "@jridgewell/trace-mapping": "^0.3.24"
      },
      "engines": {
        "node": ">=6.0.0"
      }
    },
    "node_modules/@babel/code-frame": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.27.1.tgz",
      "integrity": "sha512-cjQ7ZlQ0Mv3b47hABuTevyTuYN4i+loJKGeV9flcCgIK37cCXRh+L1bd3iBHlynerhQ7BhCkn2BPbQUL+rGqFg==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-validator-identifier": "^7.27.1",
        "js-tokens": "^4.0.0",
        "picocolors": "^1.1.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/compat-data": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.28.0.tgz",
      "integrity": "sha512-60X7qkglvrap8mn1lh2ebxXdZYtUcpd7gsmy9kLaBJ4i/WdY8PqTSdxyA8qraikqKQK5C1KRBKXqznrVapyNaw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/core": {
      "version": "7.28.3",
      "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.28.3.tgz",
      "integrity": "sha512-yDBHV9kQNcr2/sUr9jghVyz9C3Y5G2zUM2H2lo+9mKv4sFgbA8s8Z9t8D1jiTkGoO/NoIfKMyKWr4s6CN23ZwQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@ampproject/remapping": "^2.2.0",
        "@babel/code-frame": "^7.27.1",
        "@babel/generator": "^7.28.3",
        "@babel/helper-compilation-targets": "^7.27.2",
        "@babel/helper-module-transforms": "^7.28.3",
        "@babel/helpers": "^7.28.3",
        "@babel/parser": "^7.28.3",
        "@babel/template": "^7.27.2",
        "@babel/traverse": "^7.28.3",
        "@babel/types": "^7.28.2",
        "convert-source-map": "^2.0.0",
        "debug": "^4.1.0",
        "gensync": "^1.0.0-beta.2",
        "json5": "^2.2.3",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      },
      "funding": {
        "type": "opencollective",
        "url": "https://opencollective.com/babel"
      }
    },
    "node_modules/@babel/generator": {
      "version": "7.28.3",
      "resolved": "https://registry.npmjs.org/@babel/generator/-/generator-7.28.3.tgz",
      "integrity": "sha512-3lSpxGgvnmZznmBkCRnVREPUFJv2wrv9iAoFDvADJc0ypmdOxdUtcLeBgBJ6zE0PMeTKnxeQzyk0xTBq4Ep7zw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/parser": "^7.28.3",
        "@babel/types": "^7.28.2",
        "@jridgewell/gen-mapping": "^0.3.12",
        "@jridgewell/trace-mapping": "^0.3.28",
        "jsesc": "^3.0.2"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-compilation-targets": {
      "version": "7.27.2",
      "resolved": "https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.27.2.tgz",
      "integrity": "sha512-2+1thGUUWWjLTYTHZWK1n8Yga0ijBz1XAhUXcKy81rd5g6yh7hGqMp45v7cadSbEHc9G3OTv45SyneRN3ps4DQ==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/compat-data": "^7.27.2",
        "@babel/helper-validator-option": "^7.27.1",
        "browserslist": "^4.24.0",
        "lru-cache": "^5.1.1",
        "semver": "^6.3.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-globals": {
      "version": "7.28.0",
      "resolved": "https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz",
      "integrity": "sha512-+W6cISkXFa1jXsDEdYA8HeevQT/FULhxzR99pxphltZcVaugps53THCeiWA8SguxxpSp3gKPiuYfSWopkLQ4hw==",
      "dev": true,
      "license": "MIT",
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-imports": {
      "version": "7.27.1",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.27.1.tgz",
      "integrity": "sha512-0gSFWUPNXNopqtIPQvlD5WgXYI5GY2kP2cCvoT8kczjbfcfuIljTbcWrulD1CIPIX2gt1wghbDy08yE1p+/r3w==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/traverse": "^7.27.1",
        "@babel/types": "^7.27.1"
      },
      "engines": {
        "node": ">=6.9.0"
      }
    },
    "node_modules/@babel/helper-module-transforms": {
      "version": "7.28.3",
      "resolved": "https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.3.tgz",
      "integrity": "sha512-gytXUbs8k2sXS9PnQptz5o0QnpLL51SwASIORY6XaBKF88nsOT0Zw9szLqlSGQDP/4TljBAD5y98p2U1fqkdsw==",
      "dev": true,
      "license": "MIT",
      "dependencies": {
        "@babel/helper-module-imports": "^7.27.1",
        "@babel/helper-validator-identifier": "^7.27.1",
        "@babel/traverse": "^7.28.3"
      },
      "engines": {
        "node": ">=6.9.0"
```

### brain-stem-dashboard/package.json
```
{
  "name": "brain-stem-dashboard",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite",
    "test": "echo 'No tests yet'"
  },
  "dependencies": {
    "d3": "^7.8.5",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.0.0"
  }
}
```

### send_to_unreal_bridge/agent_mode.py
```
import sys, subprocess, shutil
from pathlib import Path
from datetime import datetime

# ===============================
# CONFIG — edit only if you want
# ===============================
BRIDGE_ROOT = Path(r"C:\Users\felix\Desktop\Blender\send_to_unreal_bridge")
# Folders to scan for code (relative to BRIDGE_ROOT)
SCAN_DIRS = ["", "ue_python", "blender", "scripts"]
# File include patterns (lowercase, simple contains check)
INCLUDE_MATCHES = ["blender_addon", "send_to_unreal", "bridge_watcher", ".py"]

# Git auto-commit after successful updates
AUTO_GIT_COMMIT = True
GIT_COMMIT_MESSAGE = "auto: agent update"

# Default model (override with --model=mixtral / mistral / codellama)
DEFAULT_MODEL = "mixtral"

# ===============================
# CLI args
# ===============================
MODEL = DEFAULT_MODEL
TASK_FROM_ARG = None
for arg in sys.argv[1:]:
    if arg.startswith("--model="):
        MODEL = arg.split("=", 1)[1].strip()
    elif arg.startswith("--task="):
        TASK_FROM_ARG = arg.split("=", 1)[1].strip()

# ===============================
# Helpers
# ===============================
def say(msg: str): print(f"[Agent] {msg}")
def err(msg: str): print(f"[Agent][ERROR] {msg}")
def ts(): return datetime.now().strftime("%Y%m%d_%H%M%S")

def ensure_model_exists(model_name: str):
    try:
        out = subprocess.run(["ollama", "list"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if out.returncode != 0:
            err(out.stderr.strip() or "Unknown error from `ollama list`")
            raise SystemExit(1)
        if model_name not in out.stdout:
            say(f"Model '{model_name}' not found. Pulling now…")
            pull = subprocess.run(["ollama", "pull", model_name])
            if pull.returncode != 0:
                err(f"Failed to pull model '{model_name}'. Install manually with: ollama pull {model_name}")
                raise SystemExit(1)
    except FileNotFoundError:
        err("Ollama not found. Install from https://ollama.com and ensure it’s on PATH.")
        raise SystemExit(1)

def run_ollama(prompt: str) -> str:
    ensure_model_exists(MODEL)
    say(f"Sending prompt to Ollama model: {MODEL}")
    print("="*60)
    proc = subprocess.Popen(
        ["ollama", "run", MODEL, prompt],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    full = ""
    try:
        for line in proc.stdout:
            print(line, end="")
            full += line
        proc.stdout.close()
        proc.wait()
        errout = proc.stderr.read()
        if errout:
            print(f"\n[Agent] Ollama stderr: {errout.strip()}")
    except KeyboardInterrupt:
        print("\n[Agent] Interrupted; terminating Ollama process.")
        proc.terminate()
    print("\n" + "="*60)
    return full.strip()

def backup_file(path: Path):
    bdir = BRIDGE_ROOT / "releases" / "backups"
    bdir.mkdir(parents=True, exist_ok=True)
    bpath = bdir / f"{path.stem}_{ts()}{path.suffix}"
    bpath.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    say(f"Backed up {path.name} -> {bpath.name}")

def discover_targets() -> list[Path]:
    found = []
    for sub in SCAN_DIRS:
        base = (BRIDGE_ROOT / sub).resolve()
        if not base.exists():
            continue
        for p in base.rglob("*.py"):
            name = p.name.lower()
            # Keep only python files that match our include hints
            if any(tok in name for tok in INCLUDE_MATCHES):
                found.append(p)
    # De-dupe while preserving order
    uniq, seen = [], set()
    for p in found:
        if p.resolve() not in seen:
            uniq.append(p)
            seen.add(p.resolve())
    return uniq

def update_file_with_ai(task_list: str, file_path: Path):
    original_code = file_path.read_text(encoding="utf-8")
    prompt = f"""You are a helpful Python developer working on a Blender↔Unreal asset bridge.
Follow these TASKS precisely, keep code clean, documented, and backwards-compatible.

TASKS:
{task_list}

Here is the current file {file_path.name}:

{original_code}

"""
```

### send_to_unreal_bridge/blender_addon_send_to_unreal.py
```
bl_info = {
    "name": "Send to Unreal (Bridge)",
    "author": "Ada",
    "version": (0, 1, 0),
    "blender": (3, 0, 0),
    "location": "3D View > Sidebar > Send to Unreal",
    "description": "Exports selected objects to a watched folder for UE5 auto-import & placement",
    "category": "Import-Export",
}

import bpy
from bpy.props import StringProperty, BoolProperty, FloatProperty
from bpy.types import AddonPreferences, Operator, Panel
import json
import logging
import time
from pathlib import Path

LOG_FILE = Path.home() / ".blender_bridge" / "bridge_export.log"


def _setup_logger():
    """Configure a basic file logger used by the exporter."""
    logger = logging.getLogger("blender_bridge")
    if logger.handlers:
        return logger
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(LOG_FILE),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    return logger


def get_default_bridge_path():
    # Cross-platform user home + "UE_Bridge"
    return str(Path.home() / "UE_Bridge")

class STU_AddonPrefs(AddonPreferences):
    bl_idname = __name__

    bridge_path: StringProperty(
        name="Bridge Folder",
        subtype='DIR_PATH',
        default=get_default_bridge_path(),
        description="Folder that Unreal watches for new FBX/GLTF files",
    )

    scale: FloatProperty(
        name="Export Scale",
        default=1.0,
        min=0.001, max=100.0
    )

    apply_transforms: BoolProperty(
        name="Apply Transforms",
        default=True,
        description="Apply transforms on export"
    )

    triangulate: BoolProperty(
        name="Triangulate",
        default=False,
        description="Triangulate meshes on export"
    )

    export_selected_only: BoolProperty(
        name="Selected Only",
        default=True,
        description="Export only selected objects"
    )

    def draw(self, context):
        layout = self.layout
        col = layout.column()
        col.prop(self, "bridge_path")
        col.prop(self, "scale")
        col.prop(self, "apply_transforms")
        col.prop(self, "triangulate")
        col.prop(self, "export_selected_only")

class STU_OT_SendToUnreal(Operator):
    bl_idname = "stu.send_to_unreal"
    bl_label = "Send to Unreal"
    bl_description = "Export selected objects to the bridge folder for UE auto-import"

    asset_name: StringProperty(
        name="Asset Name",
        description="Optional name for the exported asset file (otherwise uses active object)",
        default="",
    )

    def execute(self, context):
        logger = _setup_logger()
        prefs = context.preferences.addons[__name__].preferences
        bridge_dir = Path(bpy.path.abspath(prefs.bridge_path)).expanduser()

        try:
            bridge_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            self.report({'ERROR'}, f"Could not create bridge folder: {e}")
            logger.error("Could not create bridge folder %s: %s", bridge_dir, e)
            return {'CANCELLED'}

        # Determine export target name
        active_obj = context.view_layer.objects.active if context.view_layer.objects.active else None
        base_name = self.asset_name.strip() or (active_obj.name if active_obj else "BlenderExport")
        ts = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{base_name}_{ts}.fbx"
        out_path = bridge_dir / filename

        # Ensure selection if needed
        if prefs.export_selected_only and not any(obj.select_get() for obj in context.scene.objects):
            self.report({'ERROR'}, "No objects selected and 'Selected Only' is enabled.")
            return {'CANCELLED'}

        # Export settings
        kwargs = dict(
            filepath=str(out_path),
            check_existing=False,
            use_selection=prefs.export_selected_only,
            global_scale=prefs.scale,
            apply_unit_scale=True,
            bake_space_transform=prefs.apply_transforms,
            object_types={'MESH', 'ARMATURE'},
            add_leaf_bones=False,
            use_armature_deform_only=True,
            path_mode='COPY',
            embed_textures=False,
        )
        objects = context.selected_objects if prefs.export_selected_only else context.scene.objects

        # Ensure smooth shading and auto smooth on meshes
        for obj in objects:
            if obj.type == 'MESH':
                mesh = obj.data
                for poly in mesh.polygons:
                    poly.use_smooth = True
        
        # Apply all modifiers before export if enabled
        for obj in objects:
            if obj.type == 'MESH':
                depsgraph = bpy.context.evaluated_depsgraph_get()
                obj_eval = obj.evaluated_get(depsgraph)
                mesh_data = bpy.data.meshes.new_from_object(obj_eval)
                obj.data = mesh_data

        # Triangulate workaround: use modifier during export pass
        # (Simpler than building a temp modifier stack pass).
        if prefs.triangulate:
            # Add triangulate temporarily
            added = []
            for obj in context.selected_objects if prefs.export_selected_only else context.scene.objects:
                if obj.type == 'MESH':
                    mod = obj.modifiers.new(name="__STU_Triangulate", type='TRIANGULATE')
                    added.append((obj, mod))
            try:
                bpy.ops.export_scene.fbx(**kwargs)
            finally:
```

### send_to_unreal_bridge/__init__.py
```
(unreadable or empty)
```

### tests/test_autostart.py
```
from pathlib import Path
from unittest import mock

from send_to_unreal_bridge.ue_python.bridge_autostart import start_watcher


def test_start_watcher_guard(tmp_path):
    py = Path("python")
    watcher = tmp_path / "bridge_watcher.py"
    project = tmp_path
    content = tmp_path / "Content"
    log = tmp_path / "log.txt"
    lock = tmp_path / "watch.lock"

    with mock.patch("subprocess.Popen") as popen:
        assert start_watcher(py, watcher, project, content, log, lock)
        assert lock.exists()
        assert popen.call_count == 1
        assert not start_watcher(py, watcher, project, content, log, lock)
        assert popen.call_count == 1
```

### tests/test_texture_detection.py
```
from pathlib import Path

from send_to_unreal_bridge.ue_python.bridge_watcher import detect_textures


def test_detect_textures_basic(tmp_path):
    files = [
        tmp_path / "Tree_BaseColor.png",
        tmp_path / "Tree_Normal.png",
        tmp_path / "Tree_ORM.png",
    ]
    result = detect_textures(files)
    assert result["base_color"].name == "Tree_BaseColor.png"
    assert result["normal"].name == "Tree_Normal.png"
    assert result["orm"].name == "Tree_ORM.png"
```

### send_to_unreal_bridge/ue_python/bridge_watcher.py
```
import argparse
import logging
import time
from pathlib import Path

try:  # pragma: no cover - Unreal not available during tests
    import unreal  # type: ignore
except Exception:  # pragma: no cover - allow local testing
    unreal = None  # type: ignore

WATCHED_EXTS = {".fbx", ".glb", ".gltf"}
POLL_SECONDS = 3.0

BRIDGE_DIR = Path.home() / "UE_Bridge"
DEST_CONTENT_PATH = "/Game/Imported/Bridge"

_state = {"last": 0.0, "imported": set(), "handle": None}

logger = logging.getLogger("bridge_watcher")
if not logger.handlers:
    logger.addHandler(logging.NullHandler())

TEXTURE_TOKENS = {
    "base_color": {"basecolor", "albedo", "base_color"},
    "normal": {"normal"},
    "orm": {"orm"},
    "roughness": {"roughness"},
    "metallic": {"metallic"},
    "ao": {"occlusion"},
}

def detect_textures(files):
    """Return a mapping of texture types from an iterable of Paths."""
    result = {}
    for p in files:
        name = p.stem.lower()
        for key, tokens in TEXTURE_TOKENS.items():
            if any(tok in name for tok in tokens):
                result[key] = p
    return result


def _ensure_dest():
    if unreal and not unreal.EditorAssetLibrary.does_directory_exist(DEST_CONTENT_PATH):
        unreal.EditorAssetLibrary.make_directory(DEST_CONTENT_PATH)


def _fbx_ui():
    ui = unreal.FbxImportUI()
    ui.import_mesh = True
    ui.import_as_skeletal = False
    ui.import_textures = False
    ui.import_materials = False
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    ui.static_mesh_import_data.combine_meshes = True
    ui.static_mesh_import_data.auto_generate_collision = True
    return ui


def _spawn(asset_path):
    world = unreal.EditorLevelLibrary.get_editor_world()
    sm = unreal.EditorAssetLibrary.load_asset(asset_path)
    if world and sm:
        unreal.EditorLevelLibrary.spawn_actor_from_object(
            sm, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
        )


def _apply_material(asset_path, src_path: Path):
    tex_dir = src_path.parent / "Textures"
    textures = detect_textures(tex_dir.iterdir()) if tex_dir.exists() else {}
    logger.info("Applying material for %s using %s", asset_path, textures)
    # Full material workflow omitted; this stub logs intent.


def _import(full: Path):
    name = full.stem
    ui = _fbx_ui()
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(full))
    task.set_editor_property("destination_path", DEST_CONTENT_PATH)
    task.set_editor_property("destination_name", name)
    task.set_editor_property("options", ui)

    # Important flags
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)
    task.set_editor_property("replace_existing", True)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    asset_path = f"{DEST_CONTENT_PATH}/{name}.{name}"
    _apply_material(asset_path, full)
    _spawn(asset_path)
    _state["imported"].add(str(full))
    logger.info("Imported & spawned: %s", name)


def _tick(_delta_seconds):
    now = time.time()
    if now - _state["last"] < POLL_SECONDS:
        return
    _state["last"] = now

    if not BRIDGE_DIR.exists():
        try:
            BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
            logger.info("Created bridge dir %s", BRIDGE_DIR)
        except Exception as e:  # pragma: no cover
            logger.error("Cannot create folder: %s", e)
            return

    for p in BRIDGE_DIR.iterdir():
        if p.suffix.lower() not in WATCHED_EXTS or str(p) in _state["imported"]:
            continue
        try:
            s1 = p.stat().st_size
            time.sleep(0.05)
            s2 = p.stat().st_size
            if s1 != s2:
                continue  # still writing
            _import(p)
        except Exception as e:  # pragma: no cover
            logger.error("Import failed: %s -> %s", p, e)


def start():
    if _state["handle"] is not None:
        logger.warning("Already running.")
        return
    _ensure_dest()
    _state["handle"] = unreal.register_slate_post_tick_callback(_tick)
    logger.info("Watching: %s", BRIDGE_DIR)
    logger.info("Dest: %s", DEST_CONTENT_PATH)
    logger.info("Poll every %ss (non-blocking).", POLL_SECONDS)


def stop():
    if _state["handle"] is not None:
        unreal.unregister_slate_post_tick_callback(_state["handle"])
        _state["handle"] = None
        logger.info("Stopped.")
    else:
        logger.warning("Not running.")


def parse_args():
    p = argparse.ArgumentParser(description="Unreal bridge watcher")
    p.add_argument("--bridge", default=str(BRIDGE_DIR))
    p.add_argument("--content", default=DEST_CONTENT_PATH)
    p.add_argument("--log", default=str(Path.home() / "BridgeWatcher.log"))
    return p.parse_args()


def configure(args):
    global BRIDGE_DIR, DEST_CONTENT_PATH
    BRIDGE_DIR = Path(args.bridge)
    DEST_CONTENT_PATH = args.content
    logging.basicConfig(
        filename=str(Path(args.log)),
        level=logging.INFO,
```

### send_to_unreal_bridge/ue_python/__init__.py
```
(unreadable or empty)
```

### brain-stem-dashboard/node_modules/.bin/browserslist.ps1
```
#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  # Fix case when both the Windows and Linux builds of Node
  # are installed in the same directory
  $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe") {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "$basedir/node$exe"  "$basedir/../browserslist/cli.js" $args
  } else {
    & "$basedir/node$exe"  "$basedir/../browserslist/cli.js" $args
  }
  $ret=$LASTEXITCODE
} else {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "node$exe"  "$basedir/../browserslist/cli.js" $args
  } else {
    & "node$exe"  "$basedir/../browserslist/cli.js" $args
  }
  $ret=$LASTEXITCODE
}
exit $ret
```
