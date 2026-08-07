import subprocess
import time

TASKS = [
    "Fix CTO orchestrator stale-state for staffing blockers",
    "Audit QA test registry validity",
    "Verify smoke test execution path after staffing fix"
]

def run_task(task):
    print(f"\n=== RUNNING TASK ===\n{task}\n")

    prompt = f"""
Use ACE TASK EXECUTION SKILL.

Task:
{task}
"""

    result = subprocess.run(
        ["codex", "run", prompt],
        capture_output=True,
        text=True
    )

    print(result.stdout)

    return result.stdout


def evaluate(result):
    if "Validation Results" in result and "FAIL" not in result:
        return "pass"
    return "fail"


def main():
    for task in TASKS:
        result = run_task(task)

        outcome = evaluate(result)

        if outcome == "pass":
            print("Task passed validation\n")
        else:
            print("Task failed validation — requires follow-up\n")

        time.sleep(2)


if __name__ == "__main__":
    main()