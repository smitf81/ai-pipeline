# AI Core Engine (vNext) — README_CORE

## Purpose
AI Core Engine is a **local‑first project brain** for building *Emergence* (and related tools) with minimal friction.

It exists to solve one problem:

> **Keep the project coherent across days, tools, and mood/energy shifts — without paid APIs.**

It does this by combining:
- **A canonical “Project Brain”** (files in Git)
- **A Manager** that summarises, detects drift, and proposes next actions
- **Small, narrow worker agents** that update docs, generate tasks, and scaffold code safely
- **A simple UI** that makes progress visible (especially to non‑dev observers)

---

## Non‑Goals (Hard Limits)
AI Core Engine is **not**:
- a fully autonomous self‑evolving system
- a replacement for Unreal/Blender tooling
- a magical integration layer for Notion/GDrive/UE introspection
- a long‑running background daemon (yet)

The aim is **reliable continuity**, not maximal autonomy.

---

## Core Principle
**Everything important becomes text.**  
If it matters, it goes into the repo.

Chat sessions are temporary. Tools are messy. Memory drifts.  
The repo doesn’t.

---

## Repo Layout (Canonical)
Within `ai‑pipeline/`:

```
projects/
  emergence/
    project_brain.md
    roadmap.md
    decisions.md
    tasks.md
    state.json
    changelog.md
work/
  logs/
  tasks/
agents/
runner/
connectors/
ui/
```

### File meanings
- **project_brain.md** — “single source of truth” snapshot (what we’re building, why, current focus)
- **roadmap.md** — milestones (3 levels: Now / Next / Later)
- **decisions.md** — decision log (date, summary, rationale, consequences)
- **tasks.md** — actionable checklist derived from decisions/roadmap
- **state.json** — machine‑readable state (for Manager + UI)
- **changelog.md** — brief iteration notes / progress record

---

## The Manager (Introspective Orchestrator)
The Manager is the system’s “executive function”.

### Responsibilities
- Read: `project_brain.md`, `roadmap.md`, `decisions.md`, `tasks.md`, `state.json`, latest logs
- Produce:
  - **Current Focus summary** (1–3 sentences)
  - **Today’s small win** suggestion (energy‑aware)
  - **Risk/Drift warning** (e.g. “new subsystem spiral detected”)
  - **Next actions** (3–7 tasks)
- Update:
  - `state.json` (current_focus, active_milestone, last_updated, blockers, next_actions)

### Behaviour constraints
- Never rewrite the whole brain.
- Only propose changes; apply changes via worker agents.
- Always keep outputs short and scannable.

---

## Worker Agents (Narrow, Safe, Useful)
These are small modules/scripts with strict scopes.

### 1) DocScribe
**Input:** a decision or session summary  
**Output:** appends to `decisions.md` and/or `changelog.md`

Rules:
- must include date + concise rationale
- no rewriting history

### 2) TaskSmith
**Input:** roadmap/decision deltas  
**Output:** updates `tasks.md` with checklists, grouped by milestone

Rules:
- tasks must be small, testable, and phrased as verbs
- avoid vague items like “improve system”

### 3) ScaffoldSmith
**Input:** explicit request to scaffold files  
**Output:** creates stub files in `runner/`, `agents/`, or `ui/` with placeholders

Rules:
- no destructive file operations
- never modifies UE project files directly
- only adds new files unless explicitly instructed

---

## UI (The “Face”)
A simple UI makes the system visible and reduces friction.

### UI v1 screens (only 3)
1) **Dashboard**
   - Current focus
   - Active milestone
   - Today’s small win
   - Blockers
   - Last update time

2) **Log & Decisions**
   - Latest changelog entries
   - Recent decisions
   - Button: “Add decision” (routes to DocScribe)

3) **Tasks**
   - Milestone‑based checklist
   - Button: “Generate tasks from roadmap” (routes to TaskSmith)

### UI constraints
- local‑first
- reads from repo files
- writes only through worker agents (no direct arbitrary edits)

---

## Model Strategy (No Paid APIs Required)
- **ChatGPT (this chat)**: high‑level reasoning, architecture, code generation, planning
- **Local LLM (Ollama Mixtral/Llama)**: optional helper for summarisation or task generation
- The system must remain functional even if local LLM output is poor.

---

## Operating Loop (Daily Use)
1) Start day → open UI Dashboard  
2) Manager generates: Focus + Small Win + Next Actions  
3) You do 1–2 tasks  
4) DocScribe logs what happened  
5) TaskSmith refines next tasks  
6) Commit changes

---

## Milestone 1 (MVP)
**Goal:** “The system feels real.”

Deliverables:
- repo brain files exist under `projects/emergence/`
- Manager can generate `state.json` from docs
- UI v1 can display `state.json` and read markdown files
- DocScribe can append a decision entry
- TaskSmith can generate/update `tasks.md`

Success looks like:
- You can show Kerry a dashboard that clearly says what you’re building and what progress was made this week.

---

## Milestone 2 (UE/Blender Assist Hooks)
- optional “generate UE snippet” panel
- store snippets in `work/tasks/` as ready‑to‑paste blocks
- build a “known fixes” knowledge base inside the repo

---

## Safety & Stability Rules
- No autonomous changes to your Unreal project.
- No deleting files.
- All generated output is reviewable text first.
- Always prefer small wins and visible progress.

---

## Immediate Next Step
Create the canonical files under `projects/emergence/` and populate them minimally:
- `project_brain.md` (10 lines)
- `roadmap.md` (Now/Next/Later)
- `decisions.md` (start empty)
- `tasks.md` (start empty)
- `state.json` (seed fields)
- `changelog.md` (start empty)

Then implement Manager v0 to output `state.json`.