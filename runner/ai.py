import argparse
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "work" / "tasks"


def next_task_id() -> str:
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    ids = []
    for p in TASKS_DIR.iterdir():
        if p.is_dir() and p.name[:4].isdigit():
            ids.append(int(p.name[:4]))
    return f"{(max(ids) + 1) if ids else 1:04d}"


def write_task(task_id: str, title: str, idea: str) -> Path:
    safe_title = "".join(ch for ch in title if ch.isalnum() or ch in (" ", "-", "_")).strip()
    safe_title = safe_title.replace(" ", "-")[:40] or "task"
    task_dir = TASKS_DIR / f"{task_id}-{safe_title}"
    task_dir.mkdir(parents=True, exist_ok=False)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%SZ")

    (task_dir / "idea.txt").write_text(idea.strip() + "\n", encoding="utf-8")
    (task_dir / "plan.md").write_text(
        f"# Task {task_id}: {title}\n\n"
        f"Created: {now}\n\n"
        "## Goal\n"
        "- \n\n"
        "## MVP scope (must-haves)\n"
        "- \n\n"
        "## Out of scope (not now)\n"
        "- \n\n"
        "## Acceptance criteria\n"
        "- [ ] \n\n"
        "## Risks / notes\n"
        "- \n",
        encoding="utf-8",
    )

    (task_dir / "meta.json").write_text(
        json.dumps(
            {
                "id": task_id,
                "title": title,
                "created_utc": now,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    return task_dir


def cmd_idea(args: argparse.Namespace) -> int:
    task_id = next_task_id()
    task_dir = write_task(task_id, args.title, args.idea)
    print(f"✅ Created task {task_id}")
    print(f"   {task_dir}")
    return 0


def cmd_list(_: argparse.Namespace) -> int:
    if not TASKS_DIR.exists():
        print("No tasks yet.")
        return 0

    tasks = sorted([p for p in TASKS_DIR.iterdir() if p.is_dir()])
    if not tasks:
        print("No tasks yet.")
        return 0

    for p in tasks:
        meta = p / "meta.json"
        title = p.name
        created = ""
        if meta.exists():
            try:
                data = json.loads(meta.read_text(encoding="utf-8"))
                title = f"{data.get('id', '????')} - {data.get('title', p.name)}"
                created = data.get("created_utc", "")
            except Exception:
                pass
        print(f"- {title}" + (f" ({created})" if created else ""))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="ai", description="AI Pipeline runner (MVP)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_idea = sub.add_parser("idea", help="Create a new task from an idea")
    p_idea.add_argument("title", help="Short title for the task")
    p_idea.add_argument("idea", help="The idea / request text")
    p_idea.set_defaults(func=cmd_idea)

    p_list = sub.add_parser("list", help="List tasks")
    p_list.set_defaults(func=cmd_list)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
