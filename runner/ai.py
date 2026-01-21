import argparse
import json
import os
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
    try:
        return json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"Failed to read projects.json: {e}")


def resolve_project_path(project_key_or_path: str) -> Path:
    """
    Allows:
      --project bridge      (lookup in projects.json)
      --project C:\path\to  (direct path)
    """
    s = (project_key_or_path or "").strip().strip('"')
    if not s:
        raise ValueError("Project must be provided (key in projects.json or a direct path).")

    projects = load_projects()
    if s in projects:
        return Path(projects[s]).expanduser()

    # Treat as direct path
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

    if not TASKS_DIR.exists():
        raise FileNotFoundError("No tasks directory found.")

    matches = [
        p for p in TASKS_DIR.iterdir()
        if p.is_dir() and p.name.startswith(prefix + "-")
    ]

    if not matches:
        raise FileNotFoundError(f"Task {prefix} not found.")
    if len(matches) > 1:
        raise RuntimeError(f"Multiple tasks match {prefix}, please tidy tasks dir.")

    return matches[0]


def call_ollama(prompt: str, model: str | None = None) -> str:
    import urllib.request
    import urllib.error

    payload = {
        "model": model or DEFAULT_MODEL,
        "prompt": prompt,
        "stream": False,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/generate",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return (result.get("response") or "").strip()
    except urllib.error.URLError as e:
        raise RuntimeError(
            "Could not reach Ollama.\n"
            "Make sure it is running.\n"
            "If needed: open a terminal and run: ollama serve\n"
            f"\nDetails: {e}"
        )


def run_git(args: list[str], cwd: Path) -> str:
    try:
        out = subprocess.check_output(["git", *args], cwd=str(cwd), stderr=subprocess.STDOUT)
        return out.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def is_text_file(path: Path) -> bool:
    # quick extension allowlist (safe + useful for context)
    ok = {
        ".py", ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".ini",
        ".cfg", ".bat", ".ps1", ".uplugin", ".uproject"
    }
    return path.suffix.lower() in ok


def should_skip_dir(path: Path) -> bool:
    # skip typical heavy/noisy dirs
    skip = {
        ".git", "__pycache__", ".venv", "venv", "env",
        "Binaries", "Intermediate", "Saved", "DerivedDataCache",
        "node_modules", ".mypy_cache", ".pytest_cache", ".idea", ".vscode"
    }
    return path.name in skip


def safe_read_head(path: Path, max_lines: int = 120, max_chars: int = 12000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    lines = text.splitlines()
    head = "\n".join(lines[:max_lines])
    return head[:max_chars]


def tree_preview(root: Path, depth: int = 3, max_entries: int = 200) -> str:
    """
    Lightweight directory tree preview.
    """
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


def pick_key_files(project_root: Path) -> list[Path]:
    """
    Heuristic: pick a small set of high-signal files for context.
    """
    candidates: list[Path] = []

    # Always include README(s) if present
    for name in ["README.md", "README_materials.md", "readme.md"]:
        p = project_root / name
        if p.exists() and p.is_file():
            candidates.append(p)

    # Prefer core python modules and likely watcher/import scripts
    keywords = ("bridge", "watch", "import", "unreal", "blender", "export", "poll", "asset")
    for p in project_root.rglob("*"):
        if p.is_dir():
            continue
        if should_skip_dir(p.parent):
            continue
        if not is_text_file(p):
            continue
        lower = str(p).lower()
        if p.name.lower().startswith("readme"):
            continue
        if any(k in lower for k in keywords):
            candidates.append(p)

    # If we found nothing keywordy, just grab a few .py files near root
    if not candidates:
        for p in project_root.glob("*.py"):
            if p.is_file():
                candidates.append(p)

    # Deduplicate while keeping order
    seen = set()
    uniq = []
    for p in candidates:
        rp = str(p.resolve())
        if rp not in seen:
            uniq.append(p)
            seen.add(rp)

    # Hard cap to avoid giant context
    return uniq[:12]


def build_context_md(project_root: Path) -> str:
    project_root = project_root.resolve()

    git_branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"], project_root) or "(not a git repo?)"
    last_commit = run_git(["log", "-1", "--oneline"], project_root) or ""

    parts = []
    parts.append("# Project context bundle")
    parts.append("")
    parts.append("## Project root")
    parts.append(str(project_root))
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

    key_files = pick_key_files(project_root)
    parts.append("## Key files (snippets)")
    if not key_files:
        parts.append("- (none found by scanner)")
    parts.append("")

    for f in key_files:
        rel = f.relative_to(project_root)
        parts.append(f"### {rel.as_posix()}")
        parts.append("```")
        snippet = safe_read_head(f, max_lines=160, max_chars=14000)
        parts.append(snippet if snippet else "(unreadable or empty)")
        parts.append("```")
        parts.append("")

    return "\n".join(parts).rstrip() + "\n"


# ===== Commands =====
def cmd_idea(args: argparse.Namespace) -> int:
    task_id = next_task_id()
    safe_title = "".join(
        c for c in args.title if c.isalnum() or c in (" ", "-", "_")
    ).strip().replace(" ", "-")[:40] or "task"

    task_dir = TASKS_DIR / f"{task_id}-{safe_title}"
    task_dir.mkdir(parents=True, exist_ok=False)

    now = now_utc_iso()

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
            {
                "id": task_id,
                "title": args.title,
                "created_utc": now,
            },
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
                print(f"- {data.get('id')} - {data.get('title')} ({data.get('created_utc')})")
                continue
            except Exception:
                pass
        print(f"- {p.name}")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)

    project_root = resolve_project_path(args.project)
    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    print(f"🔎 Scanning project: {project_root}")
    context = build_context_md(project_root)

    out_path = task_dir / "context.md"
    out_path.write_text(context, encoding="utf-8")
    print(f"✅ Wrote context bundle: {out_path}")
    return 0


def cmd_manage(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)

    idea_path = task_dir / "idea.txt"
    meta_path = task_dir / "meta.json"
    plan_path = task_dir / "plan.md"
    context_path = task_dir / "context.md"

    idea = idea_path.read_text(encoding="utf-8").strip()
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    title = meta.get("title", task_dir.name)

    context_block = ""
    if context_path.exists():
        ctx = context_path.read_text(encoding="utf-8", errors="replace").strip()
        # keep prompt size sane
        max_ctx_chars = 45000
        if len(ctx) > max_ctx_chars:
            ctx = ctx[:max_ctx_chars] + "\n\n...(context truncated)\n"
        context_block = f"\n\nCONTEXT (from scanner):\n{ctx}\n"

    prompt = f"""
You are the MANAGER agent for a solo developer building Unreal Engine and Blender tools on Windows.
You MUST assume this task modifies an EXISTING codebase if context is provided. Do NOT propose rebuilding from scratch unless explicitly required.

Task ID: {meta.get("id")}
Task Title: {title}

IDEA:
{idea}
{context_block}

Write a clear, practical MVP plan in Markdown with EXACTLY these sections in this order:

# Task {meta.get("id")}: {title}

## Goal
- (1–3 bullets)

## MVP scope (must-haves)
- (5–10 concrete bullets; prefer edits to existing modules/files named in context)

## Out of scope (not now)
- (3–8 bullets)

## Acceptance criteria
- [ ] (5–10 testable checklist items)

## Risks / notes
- (edge cases, assumptions, gotchas)

Rules:
- Be concise and implementation-focused.
- No code yet, no patch yet.
- If context exists, reference specific files/modules from it.
""".strip()

    model = args.model or DEFAULT_MODEL
    print(f"🧠 Generating plan with Ollama ({model})...")
    plan = call_ollama(prompt, model=model)
    if not plan:
        raise RuntimeError("Ollama returned an empty response.")

    plan_path.write_text(plan + "\n", encoding="utf-8")
    print(f"✅ Updated plan.md for task {meta.get('id')}")
    return 0


# ===== CLI =====
def main() -> int:
    parser = argparse.ArgumentParser(prog="ai", description="AI Pipeline Runner")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_idea = sub.add_parser("idea", help="Create a new task")
    p_idea.add_argument("title")
    p_idea.add_argument("idea")
    p_idea.set_defaults(func=cmd_idea)

    p_list = sub.add_parser("list", help="List tasks")
    p_list.set_defaults(func=cmd_list)

    p_scan = sub.add_parser("scan", help="Scan a project and write a bounded context.md into the task folder")
    p_scan.add_argument("task_id", help="Task id like 0001")
    p_scan.add_argument("--project", required=True, help="Project key from projects.json (e.g. bridge) or a direct path")
    p_scan.set_defaults(func=cmd_scan)

    p_manage = sub.add_parser("manage", help="Generate MVP plan using local LLM (includes context.md if present)")
    p_manage.add_argument("task_id", help="Task id like 0001")
    p_manage.add_argument("--model", help="Ollama model name (default: mixtral)")
    p_manage.set_defaults(func=cmd_manage)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
