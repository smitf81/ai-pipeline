# AI Pipeline

Control repo for local AI / agent-driven tooling.

## Apply a task patch safely

Use the runner to validate and apply a generated task patch:

`python runner/ai.py apply --project <key> --task 0001`

Dry-run mode (validation only):

`python runner/ai.py apply --project <key> --task 0001 --dry-run`
