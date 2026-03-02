# AI Pipeline

Control repo for local AI / agent-driven tooling.

## ContextOps

Tiered context artifacts are stored in `context/`:
- `narrow.ctx.json` for active-task high-signal state.
- `broad.ctx.json` for project-wide operational state.
- `full.ctx.bin` for append-only long-form event memory.
- `index.json` for checksums, health score, and write semantics.
- `ui-summary.md` for human-readable translation of machine context.

See `context/CONTEXTOPS.md` for schemas, update algorithm, validation gates, and migration guidance.
