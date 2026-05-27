# Next Slice

Generated: 2026-05-27T16:00:00+01:00

## Interpreted Task

Create a local-model-powered "subconscious" observer for the AI Pipeline workspace: it should periodically notice bounded in-repo activity, write inspectable contextual commentary and compressed advisory memory, stay inexpensive while idle, pause around competing load, and be visible to ACE and AXIOM without being mistaken for canonical truth.

## Scope Risks

- Treating model commentary as canonical truth would violate the ACE truth model.
- A permanent unconstrained model loop could consume laptop resources during games or heavy tools.
- Completing daemon runtime, durable memory, Windows startup, ACE truth-kernel representation, and AXIOM MSOL representation in one pass risks superficial wiring unless the first slice stays strictly observational.
- Existing repository recovery work and a heavily dirty working tree are unrelated to this feature and must remain undisturbed.

## Best Next Slice

Objective: implement one real, read-only subconscious advisory lane with a live Ollama generation proof and visible status in ACE/AXIOM.

Exact area of focus:

- A hidden-capable Node daemon that scans only this workspace on an interval, calls an installed lightweight Qwen model through local Ollama, and stores bounded text commentary plus compressed memory under `brain/context/subconscious/`.
- Explicit manual pause/resume/wake controls and automatic generation deferral when CPU load or known heavy creative/game processes are present.
- A localhost-only status/control endpoint owned by the daemon.
- A labelled advisory node in the existing ACE Truth Kernel projection and an AXIOM MSOL capability/status-tool bridge.
- Windows scheduled-task install/remove scripts for hidden logon startup, leaving installation as an explicit operator action until live validation passes.

Likely files or systems involved:

- `ui/localModelClient.js`
- `ui/subconsciousDaemon.js`
- `ui/truthKernelAdapter.js`
- `ui/tests/subconsciousDaemon.test.mjs`
- `ui/tests/truthKernelAdapter.test.mjs`
- `ui/scripts/*subconscious*.ps1`
- `AXIOM/apps/launcher/server.js`
- `AXIOM/apps/launcher/public/axiom-editor.html`
- `brain/context/subconscious/` generated outputs

Why this slice comes first:

- It proves the non-negotiable requirement: fresh local-model text output under bounded resource policy.
- It establishes a single inspectable advisory store before any agents consume the memory for decisions.
- It makes availability visible without introducing an ungoverned truth source or model-authored mutation path.

Explicitly leave out:

- automatic promotion of model observations into `brain/emergence/`
- autonomous code edits or direct task creation from subconscious output
- broad semantic graph ingestion across projects
- redesign of the ACE or AXIOM interfaces beyond a minimal inspectable representation

## Definition of Done

- A live installed Ollama Qwen model produces fresh text thought artefacts and an updated bounded memory artefact from a scan of files inside this workspace only.
- Model requests are time/token/thread bounded and unloaded after a cycle; idle cycles do not continuously infer.
- Manual pause/resume is usable and load-aware deferral is represented explicitly in status.
- The daemon exposes status/control endpoints on localhost.
- ACE Truth Kernel and AXIOM MSOL visibly expose the observer as derived/advisory, not canonical state.
- Targeted tests and a direct live runtime probe record evidence of generation and gating behavior.

## Likely Follow-up Slices

1. Allow governed ACE agents to retrieve selected subconscious context through an explicit context-manager input contract.
2. Add retention policy, salience indexing, and validated retrieval tests once observation quality is reviewed.
3. Add richer AXIOM/ACE diagnostics for cadence, load deferrals, and memory provenance if the minimal status surface proves useful.

## Confidence / Uncertainty

- Confirmed: local Ollama is reachable at `http://127.0.0.1:11434` and installed models include `qwen2.5-coder:1.5b` and `qwen3.5:9b`.
- Confirmed: ACE already owns a Truth Kernel projection surface and AXIOM already owns an MSOL capability visualiser plus local MCP bridge.
- Inferred: using the smaller installed Qwen model by default is preferable for a background observer; the model remains configurable for deliberate larger-model runs.
- Unclear: which game processes matter most on this laptop, so the first pass combines CPU gating with a configurable heavy-process list and explicit pause control.
