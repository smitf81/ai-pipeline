# ContextOps Specification (Implementation Baseline)

## 1) Proposed Folder Structure

```text
context/
  narrow.ctx.json
  broad.ctx.json
  full.ctx.bin                  # NDJSON event stream fallback
  index.json
  ui-summary.md
  updates/
    2026-02-27T09-30-00Z.md
  schemas/
    narrow.schema.json
    broad.schema.json
    index.schema.json
```

## 2) JSON Schema Definitions

Canonical schemas are stored in:
- `context/schemas/narrow.schema.json`
- `context/schemas/broad.schema.json`
- `context/schemas/index.schema.json`

Defaults:
- `schema_version`: `1.0.0`
- key ordering: lexical for stable diffs
- `id`: immutable once emitted
- `source_refs`: must include at least one deterministic pointer (`F:`, `commit:`, `ticket:`)

## 3) Full Context Compression Recommendation

**Default**: `JSONL + Zstandard` (`full.ctx.jsonl.zst`) with one immutable event per line.

**Fallback (current repo)**: `full.ctx.bin` containing NDJSON payload for portability.

Record shape per line:

```json
{
  "schema_version": "1.0.0",
  "event_id": "evt-YYYY-MM-DD-NNNN",
  "event_type": "decision|task_update|incident|snapshot",
  "timestamp": "RFC3339",
  "actor": "agent-or-service",
  "trace_ref": "trace pointer",
  "records": ["context-item-id"],
  "payload": {}
}
```

## 4) Update Algorithm (Per Pipeline Run)

Executable command:

```bash
python runner/ai.py context_update --goal "<active-goal>"
```

Implemented in `runner/ai.py` (`cmd_context_update` + helper functions):

1. Acquire canonical inputs from repo modules + existing `context/full.ctx.bin` events.
2. Rebuild Broad model with deterministic keys and ordered records.
3. Regenerate Narrow from active goal + high-priority records and attach provenance pointers.
4. Append immutable event to Full context stream (`full.ctx.bin`, NDJSON line format).
5. Run validation gates:
   - required field checks for each item
   - confidence/priority/source_refs constraints
   - token budget checks (Narrow hard cap, Broad soft cap)
   - orphan supersedence checks
   - provenance checks (Narrow -> Broad/Full)
6. Abort publish on validation error.
7. Atomically write `narrow.ctx.json`, `broad.ctx.json`, `ui-summary.md`, and update changelog.
8. Recompute checksums and health score, then atomically publish `index.json`.

Atomic write semantics:
- Write to `*.tmp` then `os.replace(tmp, target)`.
- Manifest includes `lock_file` and conflict strategy for interoperable consumers.

## 5) Validation Checklist

- Schema validation passes for Narrow/Broad/Index.
- `narrow.items[*].source_refs` is non-empty.
- Every Narrow item has provenance to Broad (`broad_context_id`) and Full (`full_trace_pointer`).
- `index.files[*].sha256` matches current content.
- Orphan check: no `supersedes`/`superseded_by` target missing.
- Token budget checks:
  - Narrow <= 6000 hard cap
  - Broad <= 30000 soft cap
- Health score recomputed on every update.

## 6) Migration Plan for Existing Projects

1. Inventory current memory artifacts (docs, tickets, changelogs, issue notes, logs).
2. Create canonical mapping table from legacy fields to `contextItem` keys.
3. Backfill Broad with active records and open decisions.
4. Convert historical records to Full event log (`event_type=import`).
5. Generate Narrow from active goals + recent deltas.
6. Generate `index.json` checksums and baseline health score.
7. Run two dry-run updates to verify deterministic output and stable IDs.
8. Enable CI validation gate (schema + checksum + orphan checks).

## 7) Defaults and Alternatives

- Locking default: lock-file + atomic rename.
- Conflict default: last-writer-wins by timestamp, tie-breaker lexical actor id.
- Alternative conflict strategy: vector clocks for high-concurrency deployments.
- Compression default: `zstd -19`; alternative: gzip when zstd unavailable.
