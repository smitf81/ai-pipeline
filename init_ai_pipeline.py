import subprocess
from pathlib import Path

# ===== CONFIG =====
PROJECT_NAME = "ai-pipeline"
BASE_DIR = Path.home() / "dev"   # change if you want
# ==================

project_path = BASE_DIR / PROJECT_NAME

def run(cmd, cwd=None):
    print(f"> {cmd}")
    subprocess.run(cmd, shell=True, cwd=cwd, check=True)

def main():
    print("Creating project structure...")

    project_path.mkdir(parents=True, exist_ok=True)

    folders = [
        "runner",
        "agents",
        "projects",
        "work/tasks",
        "work/logs",
        "connectors",
    ]

    for folder in folders:
        (project_path / folder).mkdir(parents=True, exist_ok=True)

    # Basic README
    readme = project_path / "README.md"
    if not readme.exists():
        readme.write_text(
            "# AI Pipeline\n\n"
            "Control repo for local AI / agent-driven tooling.\n"
        )

    # Minimal .gitignore
    gitignore = project_path / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(
            "__pycache__/\n"
            "*.log\n"
            "work/logs/\n"
            ".venv/\n"
        )

    print("Initialising git repository...")
    run("git init", cwd=project_path)
    run("git add .", cwd=project_path)
    run('git commit -m "Initial commit: AI pipeline scaffold"', cwd=project_path)

    print("\n✅ Done.")
    print(f"Project created at: {project_path}")

if __name__ == "__main__":
    main()
