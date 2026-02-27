import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# ===== Paths =====
ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "work" / "tasks"
PROJECTS_FILE = ROOT / "projects.json"

# ===== Ollama config =====
OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_MODEL = "mixtral"


# ===== Utilities =====
def now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def load_projects() -> dict:
    if not PROJECTS_FILE.exists():
        return {}
    return json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))


def resolve_project_path(project_key_or_path: str) -> Path:
    s = (project_key_or_path or "").strip().strip('"')
    if not s:
        raise ValueError("Project must be provided (key in projects.json or a direct path).")
    projects = load_projects()
    if s in projects:
        return Path(projects[s]).expanduser()
    return Path(s).expanduser()


def next_task_id() -> str:
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    ids = []
    for p in TASKS_DIR.iterdir():
        if p.is_dir() and p.name[:4].isdigit():
            ids.append(int(p.name[:4]))
    return f"{(max(ids) + 1) if ids else 1:04d}"


def find_task_dir(task_id: str) -> Path:
    task_id = task_id.strip()
    if task_id.isdigit():
        prefix = f"{int(task_id):04d}"
    else:
        raise ValueError("Task id must be numeric (e.g. 0001)")

    matches = [p for p in TASKS_DIR.iterdir() if p.is_dir() and p.name.startswith(prefix + "-")]
    if not matches:
        raise FileNotFoundError(f"Task {prefix} not found.")
    if len(matches) > 1:
        raise RuntimeError(f"Multiple tasks match {prefix}, tidy tasks dir.")
    return matches[0]


def load_task_meta(task_dir: Path) -> dict:
    meta_path = task_dir / "meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Missing meta.json for task: {task_dir.name}")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def normalized_project_key(project_key_or_path: str) -> str:
    s = (project_key_or_path or "").strip().strip('"')
    if not s:
        return "unknown"

    projects = load_projects()
    if s in projects:
        return s

    # Allow callers to pass a direct path that maps to a configured project key.
    try:
        target = Path(s).expanduser().resolve()
    except Exception:
        return s

    for key, configured in projects.items():
        try:
            if Path(configured).expanduser().resolve() == target:
                return key
        except Exception:
            continue

    return s


def ensure_task_project_matches(task_dir: Path, selected_project: str) -> None:
    meta = load_task_meta(task_dir)
    meta_project = (meta.get("project") or "").strip()
    if meta_project and meta_project != selected_project:
        raise ValueError(
            f"Task {meta.get('id', task_dir.name)} is bound to project '{meta_project}', "
            f"but '{selected_project}' was selected."
        )


def context_path_for_project(task_dir: Path, project_key: str) -> Path:
    safe_project = "".join(c for c in project_key if c.isalnum() or c in ("-", "_", ".")).strip(".")
    safe_project = safe_project or "unknown"
    return task_dir / f"context.{safe_project}.md"


def call_ollama(prompt: str, model: str | None = None) -> str:
    import urllib.request
    import urllib.error

    payload = {"model": model or DEFAULT_MODEL, "prompt": prompt, "stream": False}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return (result.get("response") or "").strip()
    except urllib.error.URLError as e:
        raise RuntimeError(
            "Could not reach Ollama.\n"
            "If needed: open a terminal and run: ollama serve\n"
            f"Details: {e}"
        )


def run_git(args: list[str], cwd: Path) -> str:
    try:
        out = subprocess.check_output(["git", *args], cwd=str(cwd), stderr=subprocess.STDOUT)
        return out.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def should_skip_dir(path: Path) -> bool:
    skip = {
        ".git", "__pycache__", ".venv", "venv", "env",
        "Binaries", "Intermediate", "Saved", "DerivedDataCache",
        "node_modules", ".mypy_cache", ".pytest_cache", ".idea", ".vscode"
    }
    return path.name in skip


def tree_preview(root: Path, depth: int = 3, max_entries: int = 220) -> str:
    root = root.resolve()
    out = []
    count = 0

    def walk(dir_path: Path, prefix: str, d: int):
        nonlocal count
        if count >= max_entries:
            return
        try:
            entries = sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        except Exception:
            return
        for p in entries:
            if count >= max_entries:
                return
            if p.is_dir() and should_skip_dir(p):
                continue
            out.append(f"{prefix}{p.name}{'/' if p.is_dir() else ''}")
            count += 1
            if p.is_dir() and d > 0:
                walk(p, prefix + "  ", d - 1)

    out.append(f"{root.name}/")
    walk(root, "  ", depth)
    if count >= max_entries:
        out.append("  ... (truncated)")
    return "\n".join(out)


def safe_read_text(path: Path, max_chars: int = 20000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[:max_chars]
    except Exception:
        return ""


def pick_builder_files(project_root: Path) -> list[Path]:
    """
    For this repo, the only files Builder should touch for task 0001:
      - send_to_unreal_bridge/ue_python/*.py
      - tests/*.py
      - (optional) README_materials.md for understanding, but not for patch
    """
    wanted = []

    # Core watcher + autostart + related
    ue_py = project_root / "send_to_unreal_bridge" / "ue_python"
    if ue_py.exists():
        for p in sorted(ue_py.glob("*.py")):
            wanted.append(p)

    tests = project_root / "tests"
    if tests.exists():
        for p in sorted(tests.glob("*.py")):
            wanted.append(p)

    # Hard cap
    return wanted[:20]


def diff_guardrails(diff_text: str) -> tuple[bool, str]:
    """
    Basic safety:
      - must look like unified git diff
      - must only modify allowed paths
      - no deletions
    """
    if "diff --git " not in diff_text:
        return False, "Diff does not contain 'diff --git' headers."

    allowed_prefixes = (
        "send_to_unreal_bridge/ue_python/",
        "tests/",
    )

    lines = diff_text.splitlines()
    current_a = None
    current_b = None

    for line in lines:
        if line.startswith("diff --git "):
            parts = line.split()
            if len(parts) >= 4:
                current_a = parts[2].removeprefix("a/")
                current_b = parts[3].removeprefix("b/")
                # only allow within prefixes
                if not current_b.startswith(allowed_prefixes):
                    return False, f"Builder tried to touch disallowed path: {current_b}"
        if line.startswith("deleted file mode"):
            return False, "Builder attempted file deletion (not allowed)."
        if line.startswith("new file mode"):
            # allow new tests / helper json etc? for now, allow only under tests/ or ue_python/
            if current_b and not current_b.startswith(allowed_prefixes):
                return False, f"New file outside allowed paths: {current_b}"

    return True, "OK"


# ===== Commands =====
def cmd_idea(args: argparse.Namespace) -> int:
    task_id = next_task_id()
    safe_title = "".join(c for c in args.title if c.isalnum() or c in (" ", "-", "_")).strip()
    safe_title = safe_title.replace(" ", "-")[:40] or "task"

    task_dir = TASKS_DIR / f"{task_id}-{safe_title}"
    task_dir.mkdir(parents=True, exist_ok=False)

    now = now_utc_iso()
    project_key = normalized_project_key(args.project)
    (task_dir / "idea.txt").write_text(args.idea.strip() + "\n", encoding="utf-8")
    (task_dir / "plan.md").write_text(
        f"# Task {task_id}: {args.title}\n\n"
        f"Created: {now}\n\n"
        "## Goal\n- \n\n"
        "## MVP scope (must-haves)\n- \n\n"
        "## Out of scope (not now)\n- \n\n"
        "## Acceptance criteria\n- [ ] \n\n"
        "## Risks / notes\n- \n",
        encoding="utf-8",
    )
    (task_dir / "meta.json").write_text(
        json.dumps(
            {"id": task_id, "title": args.title, "project": project_key, "created_utc": now},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"✅ Created task {task_id}")
    print(f"   {task_dir}")
    return 0


def cmd_list(_: argparse.Namespace) -> int:
    if not TASKS_DIR.exists():
        print("No tasks yet.")
        return 0
    tasks = sorted(p for p in TASKS_DIR.iterdir() if p.is_dir())
    if not tasks:
        print("No tasks yet.")
        return 0
    for p in tasks:
        meta = p / "meta.json"
        if meta.exists():
            try:
                data = json.loads(meta.read_text(encoding="utf-8"))
                print(
                    f"- {data.get('id')} - {data.get('title')} "
                    f"[{data.get('project', 'unknown')}] ({data.get('created_utc')})"
                )
                continue
            except Exception:
                pass
        print(f"- {p.name}")
    return 0


def cmd_task_list(args: argparse.Namespace) -> int:
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    project_filter = normalized_project_key(args.project) if args.project else None
    entries = []
    for task_dir in TASKS_DIR.iterdir():
        if not task_dir.is_dir() or not task_dir.name[:4].isdigit():
            continue
        meta_path = task_dir / "meta.json"
        if not meta_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        project = meta.get("project") or "unknown"
        if project_filter and project != project_filter:
            continue
        entries.append(
            {
                "id": str(meta.get("id") or task_dir.name[:4]),
                "slug": task_dir.name,
                "title": str(meta.get("title") or task_dir.name),
                "project": project,
            }
        )

    entries.sort(key=lambda item: item.get("id", ""), reverse=True)
    print(json.dumps(entries, indent=2))
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)
    project_root = resolve_project_path(args.project)
    project_key = normalized_project_key(args.project)
    ensure_task_project_matches(task_dir, project_key)
    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    git_branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"], project_root) or "(not a git repo?)"
    last_commit = run_git(["log", "-1", "--oneline"], project_root) or ""

    parts = []
    parts.append("# Project context bundle")
    parts.append("")
    parts.append("## Project root")
    parts.append(str(project_root.resolve()))
    parts.append("")
    parts.append("## Git")
    parts.append(f"- branch: {git_branch}")
    if last_commit:
        parts.append(f"- last commit: {last_commit}")
    parts.append("")
    parts.append("## Tree (depth 3, truncated)")
    parts.append("```")
    parts.append(tree_preview(project_root, depth=3, max_entries=220))
    parts.append("```")
    parts.append("")
    parts.append("## Key docs")
    for doc in ["README.md", "README_materials.md", "send_to_unreal_bridge/README.txt"]:
        p = project_root / doc
        if p.exists():
            parts.append(f"### {doc}")
            parts.append("```")
            parts.append(safe_read_text(p, max_chars=12000) or "(empty/unreadable)")
            parts.append("```")
            parts.append("")

    out_path = context_path_for_project(task_dir, project_key)
    out_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
    print(f"✅ Wrote context bundle: {out_path}")
    return 0


def cmd_manage(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)
    idea = (task_dir / "idea.txt").read_text(encoding="utf-8").strip()
    meta = load_task_meta(task_dir)
    title = meta.get("title", task_dir.name)
    task_project = (meta.get("project") or "unknown").strip() or "unknown"

    ctx = ""
    ctx_path = context_path_for_project(task_dir, task_project)
    if not ctx_path.exists():
        legacy = task_dir / "context.md"
        if legacy.exists():
            ctx_path = legacy
    if ctx_path.exists():
        raw = ctx_path.read_text(encoding="utf-8", errors="replace")
        ctx = raw[:45000] + ("\n\n...(context truncated)\n" if len(raw) > 45000 else "")

    prompt = f"""
You are the MANAGER agent for a solo developer building Unreal Engine and Blender tools on Windows.
If CONTEXT is provided, you MUST treat the project as existing and propose minimal changes inside it.

Task ID: {meta.get("id")}
Task Title: {title}

IDEA:
{idea}

CONTEXT:
{ctx}

Write a practical MVP plan in Markdown with EXACTLY these sections:

# Task {meta.get("id")}: {title}

## Goal
- (1–3 bullets)

## MVP scope (must-haves)
- (5–10 concrete bullets; prefer edits to existing modules/files)

## Out of scope (not now)
- (3–8 bullets)

## Acceptance criteria
- [ ] (5–10 testable checklist items)

## Risks / notes
- (edge cases, assumptions, gotchas)

Rules:
- No code yet.
- No patch yet.
- Reference specific files/modules if context includes them.
""".strip()

    model = args.model or DEFAULT_MODEL
    print(f"🧠 Generating plan with Ollama ({model})...")
    plan = call_ollama(prompt, model=model)
    if not plan:
        raise RuntimeError("Ollama returned an empty response.")
    (task_dir / "plan.md").write_text(plan + "\n", encoding="utf-8")
    print(f"✅ Updated plan.md for task {meta.get('id')}")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    """
    Builder: generate a patch.diff file for the target project based on plan + context.
    DOES NOT apply the patch.
    """
    task_dir = find_task_dir(args.task_id)
    project_root = resolve_project_path(args.project)
    project_key = normalized_project_key(args.project)
    ensure_task_project_matches(task_dir, project_key)
    plan_path = task_dir / "plan.md"
    idea_path = task_dir / "idea.txt"
    ctx_path = context_path_for_project(task_dir, project_key)
    if not ctx_path.exists():
        legacy = task_dir / "context.md"
        if legacy.exists():
            ctx_path = legacy
    if not plan_path.exists():
        raise FileNotFoundError("plan.md missing. Run manage first.")
    if not ctx_path.exists():
        raise FileNotFoundError(f"{ctx_path.name} missing. Run scan first.")

    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    plan = plan_path.read_text(encoding="utf-8", errors="replace")[:30000]
    idea = idea_path.read_text(encoding="utf-8", errors="replace")[:8000]
    ctx = ctx_path.read_text(encoding="utf-8", errors="replace")[:45000]

    # Provide current code for the files Builder is allowed to touch
    files = pick_builder_files(project_root)
    if not files:
        raise RuntimeError("No builder files found to include (unexpected).")

    file_blocks = []
    for f in files:
        rel = f.relative_to(project_root).as_posix()
        # keep each file bounded
        content = safe_read_text(f, max_chars=22000)
        file_blocks.append(f"### FILE: {rel}\n```python\n{content}\n```\n")

    allowed_note = (
        "Allowed paths to modify/create:\n"
        "- send_to_unreal_bridge/ue_python/\n"
        "- tests/\n"
        "Not allowed: deletions, moving files, touching node_modules, dashboard, or anything else.\n"
    )

    prompt = f"""
You are the BUILDER agent. You must output ONLY a unified git diff (no explanations).
You are editing an existing repo at PROJECT ROOT shown in context.

TASK IDEA:
{idea}

TASK PLAN:
{plan}

CONTEXT:
{ctx}

{allowed_note}

CURRENT FILES (only these may be edited; you may also add NEW files only under allowed paths):
{''.join(file_blocks)}

Goal for this build (interpret from plan):
- Fix 'import hygiene' so previously processed assets do not re-import on Unreal restart.
- Use persistent tracking (e.g. JSON state file) in ue_python/bridge_watcher.py.
- Add/adjust tests to cover the persistence logic without requiring Unreal.

Output requirements:
- Output ONLY the diff.
- Diff must start with lines like: diff --git a/... b/...
- Use paths relative to project root.
- Keep changes minimal.
""".strip()

    model = args.model or DEFAULT_MODEL
    print(f"🛠️  Building patch with Ollama ({model})... (no files will be modified)")
    diff_text = call_ollama(prompt, model=model)

    ok, reason = diff_guardrails(diff_text)
    if not ok:
        out_path = task_dir / "patch.diff"
        out_path.write_text(diff_text + "\n", encoding="utf-8")
        raise RuntimeError(f"Generated diff failed guardrails: {reason}\nSaved raw output to {out_path}")

    out_path = task_dir / "patch.diff"
    out_path.write_text(diff_text.rstrip() + "\n", encoding="utf-8")
    print(f"✅ Wrote patch: {out_path}")
    print("ℹ️  Next step will be an 'apply' command to apply this patch on a new git branch.")
    return 0


# ===== CLI =====
def main() -> int:
    parser = argparse.ArgumentParser(prog="ai", description="AI Pipeline Runner")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_idea = sub.add_parser("idea", help="Create a new task")
    p_idea.add_argument("title")
    p_idea.add_argument("idea")
    p_idea.add_argument("--project", default="unknown", help="Project key this task belongs to")
    p_idea.set_defaults(func=cmd_idea)

    p_list = sub.add_parser("list", help="List tasks")
    p_list.set_defaults(func=cmd_list)

    p_task_list = sub.add_parser("task_list", help="Print task metadata as JSON, optionally filtered by project")
    p_task_list.add_argument("--project", help="Filter by project key")
    p_task_list.set_defaults(func=cmd_task_list)

    p_scan = sub.add_parser("scan", help="Scan a project and write context.md into the task folder")
    p_scan.add_argument("task_id")
    p_scan.add_argument("--project", required=True, help="Project key from projects.json or direct path")
    p_scan.set_defaults(func=cmd_scan)

    p_manage = sub.add_parser("manage", help="Generate plan.md using local LLM (includes context.md if present)")
    p_manage.add_argument("task_id")
    p_manage.add_argument("--model", help="Ollama model name (default: mixtral)")
    p_manage.set_defaults(func=cmd_manage)

    p_build = sub.add_parser("build", help="Generate patch.diff for a project (does not apply)")
    p_build.add_argument("task_id")
    p_build.add_argument("--project", required=True, help="Project key from projects.json or direct path")
    p_build.add_argument("--model", help="Ollama model name (default: mixtral)")
    p_build.set_defaults(func=cmd_build)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
