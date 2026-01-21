import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

# ===== Paths =====
ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "work" / "tasks"

# ===== Ollama config =====
OLLAMA_HOST = "http://127.0.0.1:11434"
DEFAULT_MODEL = "mixtral"


# ===== Utilities =====
def now_utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


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
            "Make sure it is running with:\n"
            "  ollama serve\n"
            f"\nDetails: {e}"
        )


# ===== Commands =====
def cmd_idea(args: argparse.Namespace) -> int:
    task_id = next_task_id()
    safe_title = "".join(
        c for c in args.title if c.isalnum() or c in (" ", "-", "_")
    ).strip().replace(" ", "-")[:40]

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


def cmd_manage(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)

    idea = (task_dir / "idea.txt").read_text(encoding="utf-8").strip()
    meta = json.loads((task_dir / "meta.json").read_text(encoding="utf-8"))
    title = meta.get("title", task_dir.name)

    prompt = f"""
You are the MANAGER agent for a solo developer building Unreal Engine and Blender tools on Windows.

Task ID: {meta.get("id")}
Task Title: {title}

IDEA:
{idea}

Write a clear, practical MVP plan in Markdown with EXACTLY these sections in this order:

# Task {meta.get("id")}: {title}

## Goal
- (1–3 bullets)

## MVP scope (must-haves)
- (5–10 concrete bullets)

## Out of scope (not now)
- (3–8 bullets)

## Acceptance criteria
- [ ] (5–10 testable checklist items)

## Risks / notes
- (edge cases, assumptions, gotchas)

Rules:
- Be concise and implementation-focused
- No code yet
- No Unreal editor automation yet
""".strip()

    model = args.model or DEFAULT_MODEL
    print(f"🧠 Generating plan with Ollama ({model})...")

    plan = call_ollama(prompt, model=model)
    if not plan:
        raise RuntimeError("Ollama returned an empty response.")

    (task_dir / "plan.md").write_text(plan + "\n", encoding="utf-8")
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

    p_manage = sub.add_parser("manage", help="Generate MVP plan using local LLM")
    p_manage.add_argument("task_id")
    p_manage.add_argument("--model", help="Ollama model name (default: mixtral)")
    p_manage.set_defaults(func=cmd_manage)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
