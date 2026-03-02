import argparse
import json
import subprocess
import time
import re
from datetime import datetime, timezone
from pathlib import Path
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


# ===== Paths =====
ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "work" / "tasks"
PROJECTS_FILE = ROOT / "projects.json"
COMMANDS_FILE = ROOT / "ace_commands.json"

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
        exact = TASKS_DIR / prefix
        if exact.exists() and exact.is_dir():
            return exact
    elif "-" in task_id and task_id[:4].isdigit():
        prefix = task_id[:4]
        exact_name = TASKS_DIR / task_id
        if exact_name.exists() and exact_name.is_dir():
            return exact_name
    else:
        raise ValueError("Task id must be numeric (e.g. 0001)")

    matches = [p for p in TASKS_DIR.iterdir() if p.is_dir() and p.name.startswith(prefix + "-")]
    if not matches:
        raise FileNotFoundError(f"Task {prefix} not found.")
    if len(matches) > 1:
        raise RuntimeError(f"Multiple tasks match {prefix}, tidy tasks dir.")
    return matches[0]


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


def run_git_checked(args: list[str], cwd: Path) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stdout or "").strip() or f"git {' '.join(args)} failed")
    return (proc.stdout or "").strip()

def is_git_repo(cwd: Path) -> bool:
    try:
        out = subprocess.check_output(["git", "rev-parse", "--is-inside-work-tree"], cwd=str(cwd), stderr=subprocess.STDOUT)
        return out.decode("utf-8", errors="replace").strip().lower() == "true"
    except Exception:
        return False


def get_clean_worktree(cwd: Path):
    """Return (clean: bool, status_output: str)."""
    try:
        out = subprocess.check_output(["git", "status", "--porcelain"], cwd=str(cwd), stderr=subprocess.STDOUT)
        s = out.decode("utf-8", errors="replace")
        return (s.strip() == ""), s
    except Exception as e:
        return False, str(e)


def get_clean_tracked_worktree(cwd: Path):
    """Return (clean: bool, status_output: str) for tracked files only."""
    try:
        out = subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=str(cwd),
            stderr=subprocess.STDOUT,
        )
        s = out.decode("utf-8", errors="replace")
        return (s.strip() == ""), s
    except Exception as e:
        return False, str(e)


def validate_patch_paths(patch_text: str) -> tuple[bool, str]:
    forbidden_prefixes = (".git/", ".hg/", ".svn/")
    seen_paths: set[str] = set()
    for line in patch_text.splitlines():
        if line.startswith("diff --git "):
            parts = line.split()
            if len(parts) < 4:
                return False, "Malformed 'diff --git' header."
            for raw in (parts[2], parts[3]):
                if raw in ("a/dev/null", "b/dev/null"):
                    continue
                cleaned = raw[2:] if raw[:2] in ("a/", "b/") else raw
                seen_paths.add(cleaned)

    if not seen_paths:
        return False, "No file paths found in patch."

    for rel in seen_paths:
        p = Path(rel)
        if p.is_absolute() or ".." in p.parts:
            return False, f"Patch contains unsafe path: {rel}"
        rel_posix = p.as_posix().lstrip("./")
        if rel_posix.startswith(forbidden_prefixes):
            return False, f"Patch touches forbidden path: {rel}"
    return True, "OK"


def ensure_gitignore_has_node_rules(repo_root: Path) -> tuple[bool, list[str]]:
    gitignore = repo_root / ".gitignore"
    required = [
        "ui/node_modules/",
        "**/node_modules/",
        "npm-debug.log*",
    ]
    existing_text = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    existing = {line.strip() for line in existing_text.splitlines() if line.strip()}
    missing = [rule for rule in required if rule not in existing]
    return len(missing) == 0, missing


def next_available_branch_name(repo_root: Path, base: str) -> str:
    candidate = base
    idx = 2
    while run_git(["branch", "--list", candidate], repo_root).strip():
        candidate = f"{base}-{idx}"
        idx += 1
    return candidate


def slugify(s: str, max_len: int = 32) -> str:
    s = (s or "").strip().lower()
    s = "".join(c if (c.isalnum() or c in "-_") else "-" for c in s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return (s[:max_len] or "task")


def load_command_presets() -> dict:
    if not COMMANDS_FILE.exists():
        return {}
    try:
        return json.loads(COMMANDS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def run_capture(cmd, cwd: Path, timeout_s: int = 900):
    """Run a command and capture combined stdout/stderr."""
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
        )
        return proc.returncode, proc.stdout or ""
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or "") if isinstance(e.stdout, str) else ""
        out += f"\n[TIMEOUT] Command exceeded {timeout_s}s.\n"
        return 124, out



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
        "ue_python/",
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
        json.dumps({"id": task_id, "title": args.title, "created_utc": now}, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"[OK] Created task {task_id}")
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

    out_path = task_dir / "context.md"
    out_path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
    print(f"✅ Wrote context bundle: {out_path}")
    return 0


def cmd_manage(args: argparse.Namespace) -> int:
    task_dir = find_task_dir(args.task_id)
    idea = (task_dir / "idea.txt").read_text(encoding="utf-8").strip()
    meta = json.loads((task_dir / "meta.json").read_text(encoding="utf-8"))
    title = meta.get("title", task_dir.name)

    ctx = ""
    ctx_path = task_dir / "context.md"
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
    plan_path = task_dir / "plan.md"
    idea_path = task_dir / "idea.txt"
    ctx_path = task_dir / "context.md"
    if not plan_path.exists():
        raise FileNotFoundError("plan.md missing. Run manage first.")
    if not ctx_path.exists():
        raise FileNotFoundError("context.md missing. Run scan first.")

    project_root = resolve_project_path(args.project)
    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    plan = plan_path.read_text(encoding="utf-8", errors="replace")[:30000]
    idea = idea_path.read_text(encoding="utf-8", errors="replace")[:8000]
    ctx = ctx_path.read_text(encoding="utf-8", errors="replace")[:45000]

    # Provide current code for the files Builder is allowed to touch
        # Collect files Builder is allowed to touch
    files = []

    # Allow both layouts:
    # 1) project_root/send_to_unreal_bridge/ue_python
    # 2) project_root/ue_python (if user pointed directly at inner folder)

    candidates = [
        project_root / "send_to_unreal_bridge" / "ue_python",
        project_root / "ue_python",
    ]

    for ue_py in candidates:
        if ue_py.exists():
            files.extend(sorted(ue_py.glob("*.py")))

    tests = project_root / "tests"
    if tests.exists():
        files.extend(sorted(tests.glob("*.py")))

    if not files:
        raise RuntimeError(
            "No builder files found. Ensure your project contains "
            "'send_to_unreal_bridge/ue_python' or 'ue_python'."
        )


    file_blocks = []
    for f in files:
        rel = f.relative_to(project_root).as_posix()
        # keep each file bounded
        content = safe_read_text(f, max_chars=22000)
        file_blocks.append(f"### FILE: {rel}\n```python\n{content}\n```\n")

    allowed_note = (
        "Allowed paths to modify/create:\n"
        "- send_to_unreal_bridge/ue_python/\n"
        "- ue_python/\n"
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


def cmd_apply(args: argparse.Namespace) -> int:
    """Apply task patch.diff to the target project on a new git branch."""
    raw_task_id = args.task_id or args.task
    if not raw_task_id:
        raise ValueError("Task id is required (use positional task_id or --task).")
    task_dir = find_task_dir(raw_task_id)
    patch_path = task_dir / "patch.diff"
    if not patch_path.exists():
        raise FileNotFoundError("patch.diff missing. Run build first.")
    if patch_path.stat().st_size == 0:
        raise RuntimeError("patch.diff is empty. Refusing to apply.")

    patch_text = patch_path.read_text(encoding="utf-8", errors="replace")
    if not patch_text.strip():
        raise RuntimeError("patch.diff is empty after trimming whitespace. Refusing to apply.")

    patch_ok, patch_reason = validate_patch_paths(patch_text)
    if not patch_ok:
        raise RuntimeError(f"Unsafe patch: {patch_reason}")

    project_root = resolve_project_path(args.project)
    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    if not is_git_repo(project_root):
        raise RuntimeError("Target project is not a git repo. Initialise git first or apply manually.")

    branch_now = run_git_checked(["rev-parse", "--abbrev-ref", "HEAD"], project_root)
    if not branch_now or branch_now == "HEAD":
        raise RuntimeError("Cannot determine current branch (detached HEAD is not supported).")

    clean, status = get_clean_tracked_worktree(project_root)
    if not clean:
        raise RuntimeError(
            "Refusing to apply: repository has uncommitted tracked changes.\n"
            "Commit or stash changes first.\n"
            f"git status --porcelain --untracked-files=no:\n{status.strip()}"
        )

    gitignore_ok, missing_rules = ensure_gitignore_has_node_rules(project_root)
    if not gitignore_ok:
        raise RuntimeError(
            "Refusing to apply: .gitignore is missing required node_modules/npm debug ignore rules:\n"
            + "\n".join(f"- {r}" for r in missing_rules)
        )

    task_id = f"{int(raw_task_id):04d}" if raw_task_id.isdigit() else raw_task_id[:4]
    branch = next_available_branch_name(project_root, f"ace/task-{task_id}-apply")

    if args.dry_run:
        print("[DRY RUN] Validation passed.")
        print(f"[DRY RUN] Task folder: {task_dir}")
        print(f"[DRY RUN] Patch: {patch_path}")
        print(f"[DRY RUN] Current branch: {branch_now}")
        print(f"[DRY RUN] Would create branch: {branch}")
        print("[DRY RUN] Would run: git apply --index <patch>")
        print(f"[DRY RUN] Would commit: ACE: apply task {task_id}")
        return 0

    run_git_checked(["checkout", "-b", branch], project_root)
    try:
        run_git_checked(["apply", "--index", str(patch_path)], project_root)
    except RuntimeError as e:
        run_git(["reset", "--hard", "HEAD"], project_root)
        run_git(["checkout", branch_now], project_root)
        run_git(["branch", "-D", branch], project_root)
        raise RuntimeError(f"Patch apply failed on branch {branch}: {e}")

    commit_subject = f"ACE: apply task {task_id}"
    commit_body = f"Applied from task folder: {task_dir.relative_to(ROOT).as_posix()}"
    run_git_checked(["commit", "-m", commit_subject, "-m", commit_body], project_root)

    commit_hash = run_git_checked(["rev-parse", "--short", "HEAD"], project_root)
    changed_files = run_git_checked(["show", "--name-only", "--pretty=format:", "HEAD"], project_root)
    changed_count = len([line for line in changed_files.splitlines() if line.strip()])

    print(f"Apply complete on branch: {branch}")
    print(f"Commit: {commit_hash}")
    print(f"Changed files: {changed_count}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    """Run an allowed command preset and capture logs into the task folder."""
    task_dir = find_task_dir(args.task_id)
    project_root = resolve_project_path(args.project)
    if not project_root.exists():
        raise FileNotFoundError(f"Project path does not exist: {project_root}")

    presets = load_command_presets()
    if args.preset not in presets:
        available = ", ".join(sorted(presets.keys())) or "(none configured)"
        raise RuntimeError(f"Unknown preset '{args.preset}'. Available: {available}")

    spec = presets[args.preset]
    rel_cwd = (spec.get("cwd") or ".").strip()
    cmd = spec.get("cmd")
    if not isinstance(cmd, list) or not cmd:
        raise RuntimeError(f"Invalid preset '{args.preset}': expected {{'cmd': [..], 'cwd': '...'}}")

    cwd = (project_root / rel_cwd).resolve()
    if not cwd.exists():
        raise FileNotFoundError(f"Preset cwd does not exist: {cwd}")

    timeout_s = int(spec.get("timeout_s") or args.timeout_s)
    started = now_utc_iso()
    t0 = time.time()
    code, output = run_capture([str(x) for x in cmd], cwd=cwd, timeout_s=timeout_s)
    duration_s = round(time.time() - t0, 3)
    finished = now_utc_iso()

    out_txt = task_dir / f"run_{args.preset}.log"
    out_txt.write_text(output, encoding="utf-8")

    report = {
        "task_id": args.task_id,
        "project": str(project_root.resolve()),
        "preset": args.preset,
        "cwd": str(cwd),
        "cmd": cmd,
        "started_utc": started,
        "finished_utc": finished,
        "duration_s": duration_s,
        "exit_code": code,
        "log_file": out_txt.name,
    }
    (task_dir / f"run_{args.preset}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"Ran preset '{args.preset}' (exit {code}, {duration_s}s)")
    print(f"Log: {out_txt}")
    return 0



# ===== CLI =====
def main() -> int:
    parser = argparse.ArgumentParser(prog="ai", description="AI Pipeline Runner")
    sub = parser.add_subparsers(dest="cmd", required=True)

    # ---- idea ----
    p_idea = sub.add_parser("idea", help="Create a new task")
    p_idea.add_argument("title")
    p_idea.add_argument("idea")
    p_idea.set_defaults(func=cmd_idea)

    # ---- list ----
    p_list = sub.add_parser("list", help="List tasks")
    p_list.set_defaults(func=cmd_list)

    # ---- scan ----
    p_scan = sub.add_parser(
        "scan",
        help="Scan a project and write context.md into the task folder"
    )
    p_scan.add_argument("task_id")
    p_scan.add_argument(
        "--project",
        required=True,
        help="Project key from projects.json or direct path"
    )
    p_scan.set_defaults(func=cmd_scan)

    # ---- manage ----
    p_manage = sub.add_parser(
        "manage",
        help="Generate plan.md using local LLM (includes context.md if present)"
    )
    p_manage.add_argument("task_id")
    p_manage.add_argument(
        "--project",
        required=True,
        help="Project key from projects.json or direct path"
    )
    p_manage.add_argument(
        "--model",
        help="Ollama model name (default: mixtral)"
    )
    p_manage.set_defaults(func=cmd_manage)

    # ---- build ----
    p_build = sub.add_parser(
        "build",
        help="Generate patch.diff for a project (does not apply)"
    )
    p_build.add_argument("task_id")
    p_build.add_argument(
        "--project",
        required=True,
        help="Project key from projects.json or direct path"
    )
    p_build.add_argument(
        "--model",
        help="Ollama model name (default: mixtral)"
    )
    p_build.set_defaults(func=cmd_build)


    # ---- apply ----
    p_apply = sub.add_parser(
        "apply",
        help="Apply patch.diff to the project on a new git branch (safe by default)"
    )
    p_apply.add_argument("task_id", nargs="?")
    p_apply.add_argument("--task", dest="task", help="Task id (e.g. 0001)")
    p_apply.add_argument(
        "--project",
        required=True,
        help="Project key from projects.json or direct path"
    )
    p_apply.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate safety checks and print planned actions without changing git state"
    )
    p_apply.set_defaults(func=cmd_apply)

    # ---- run ----
    p_run = sub.add_parser(
        "run",
        help="Run an allowed command preset and capture logs into the task folder"
    )
    p_run.add_argument("task_id")
    p_run.add_argument(
        "--project",
        required=True,
        help="Project key from projects.json or direct path"
    )
    p_run.add_argument(
        "--preset",
        required=True,
        help="Preset name from ace_commands.json (e.g. ui_start)"
    )
    p_run.add_argument(
        "--timeout-s",
        type=int,
        default=900,
        help="Fallback timeout if preset doesn't specify timeout_s (seconds)"
    )
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
