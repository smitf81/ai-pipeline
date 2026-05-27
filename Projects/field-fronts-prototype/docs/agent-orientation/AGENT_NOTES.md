# Agent Notes

This project borrows the ACE discipline without binding itself to the active ACE runtime.

- Keep intent, field, projection, and execution concepts separate.
- Do not add units or factions before the mapshop interaction is stable.
- Any future AI/agent slice should write a concise note in `progress.md` and add focused tests.
- Prefer derived fields over duplicated persistent field truth unless a field is explicitly simulated over time.
- If a future slice adds frontline evolution, treat the front as a derived/projection layer until the player commits or simulation advances it.
