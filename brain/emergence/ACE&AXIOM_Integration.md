ACE / AXIOM Foundational Architecture

Status note - 2026-05-28

This document is now historical/directional, not the live ownership contract.

Current canonical ACE truth is governed by `brain/emergence/project_brain.md` and
`brain/emergence/canonical_truth_domains.json`.

Correct current boundary:

- ACE owns canonical intent records, field influence, ghost projections, runtime
  projections, execution provenance, and QA evidence.
- AXIOM may observe ACE, organize projects, preview local proposed deltas, and
  submit intent into ACE through explicit ACE-owned contracts.
- AXIOM must not become a parallel source of ACE intent truth, field truth,
  ghost/projection truth, runtime truth, or execution truth.
- The old phrase "ACE should not think" means ACE runtime substrate should not
  absorb AXIOM authoring concerns. It does not mean AXIOM owns ACE canonical
  intent interpretation. In the current implementation, ACE's governed server
  path owns canonical intent extraction and downstream projections.
- ACE's sketchpad ghost predictions/panels remain ACE-side read-only
  projections. AXIOM can inspect or inject intent around them later, but it
  should not replace the ACE sketchpad truth path.

You are accidentally converging toward something closer to a civilization stack than a normal game engine toolchain.



Most indie projects start with:



Engine



Editor



Assets



Game



What you are actually building is more like:



Simulation substrate



Cognitive tooling layer



Spatial operating system



Autonomous production ecosystem



Persistent world runtime



Human ↔ AI co-creation interface



The distinction matters because if ACE and AXIOM are not separated correctly early, they will slowly collapse into one giant, incoherent application.



You need:



ACE = the runtime civilization substrate



AXIOM = the cognitive construction environment



Those are fundamentally different responsibilities.



Core Relationship

System	Role	Nature

ACE	Runtime world substrate	Executes reality

AXIOM	Cognitive creation environment	Designs/manages reality

User	Director/operator	Expresses intent

AI agents	Specialized cognitive workers	Translate intent into artifacts

Games/projects	Configurations atop ACE	Emergent products

High-Level Philosophy

ACE

ACE should not think.



ACE should:



simulate



execute



synchronize



persist



distribute



resolve



stream



transform



ACE is physics + ecology + networking + data + runtime + rendering + spatial logic.



It is the world.



AXIOM

AXIOM should not simulate.



AXIOM should:



understand intent



orchestrate workflows



construct systems



manipulate abstractions



coordinate AI agents



visualize relationships



translate ideas into executable structures



AXIOM is:



IDE



orchestration layer



cognitive workspace



agent ecosystem



spatial authoring environment



It is the mind.



Foundational Separation

This separation is absolutely critical.



If AXIOM starts owning runtime logic:

→ editor spaghetti

→ impossible scaling

→ multiplayer nightmares

→ AI tooling tightly coupled to simulation

→ catastrophic technical debt



If ACE starts owning creation workflows:

→ engine bloat

→ poor modularity

→ impossible external tooling integration

→ no future interoperability



Proper Responsibility Distribution

ACE — Runtime Civilization Substrate

Primary Responsibility

Execute persistent spatial reality.



ACE Core Domains

1\. Spatial Runtime Layer

Responsibilities

world representation



volumetrics



SDFs



terrain



atmosphere



fluids



destruction



weather



propagation systems



navigation fields



ecological simulation



Key Principle

Reality is represented as fields and relationships, not static meshes.



This is massively important for your direction.



2\. Simulation Layer

Responsibilities

ecology



economics



population simulation



faction simulation



logistics



AI navigation



thermal systems



fire propagation



weather



biology



resource flow



Important

Simulation should continue without player observation.



The world exists independently.



3\. Entity Runtime Layer

Responsibilities

entity lifecycle



transforms



relationships



replication



state synchronization



behavior execution



animation resolution



attachment systems



Your likely evolution

You probably move beyond traditional GameObjects/ECS eventually toward:



relational entities



field-driven entities



procedural embodiment



4\. Rendering Layer

Responsibilities

rasterization/path tracing



procedural rendering



atmospheric rendering



volumetric clouds



GI



vegetation



terrain rendering



GPU streaming



5\. Networking Layer

Responsibilities

replication



authority



prediction



rollback



distributed simulation



world sharding



persistent world state



This is where most “dream engines” die.



You should architect networking as foundational, not “added later.”



6\. Persistence Layer

Responsibilities

world state saving



streaming



chunk persistence



history recording



simulation continuity



versioned world states



7\. Runtime AI Layer

Not LLMs.



This means:



NPC decision systems



navigation



tactical systems



ecosystem behaviors



agent utility systems



LLMs should NOT be tightly embedded into core simulation.



8\. Modularity Layer

Responsibilities

plugin architecture



sandbox execution



hot reload



dynamic subsystem registration



external API exposure



ACE should become:



“a programmable reality substrate.”



AXIOM — Cognitive Construction Environment

Primary Responsibility

Translate intent into executable worlds and systems.



AXIOM Core Domains

1\. Intent Interpretation Layer

Responsibilities

natural language understanding



spatial interpretation



sketch interpretation



semantic tagging



contextual memory



multimodal understanding



This is where your sketch-to-space system lives.



2\. Agent Orchestration Layer

Responsibilities

spawning specialized agents



task decomposition



dependency tracking



artifact routing



conflict resolution



iterative refinement



Example:

User says:



“Make dragon thermals more realistic.”



AXIOM may spawn:



ecology agent



aerodynamics agent



shader agent



animation agent



balancing agent



3\. Workspace Layer

Responsibilities

graph editing



spatial editing



live previews



system visualization



dependency mapping



world inspection



This is not a traditional editor.



It becomes:



“A cognitive operating environment.”



4\. Artifact Management Layer

Responsibilities

source control abstraction



version graphs



semantic diffs



asset lineage



dependency tracing



generated artifact tracking



You need provenance tracking early because AI-generated systems become incomprehensible without it.



5\. AI Collaboration Layer

Responsibilities

conversational workflows



memory systems



task continuity



long-horizon planning



shared project context



This is where your “sub-conscious” architecture belongs.



6\. Live Runtime Bridge

Responsibilities

hot reload into ACE



simulation inspection



runtime debugging



live parameter editing



visualization overlays



AXIOM should interact with ACE like:



a surgeon operating on a living organism.



7\. Knowledge Layer

Responsibilities

project ontology



system relationships



design language



lore structures



rulesets



simulation constraints



This becomes your project's “institutional memory.”



The Correct Relationship

ACE is BELOW AXIOM

Not beside it.



Architecture stack:



User

↓

AXIOM

↓

ACE

↓

Hardware

AXIOM commands ACE.



ACE never depends on AXIOM.



This is essential.



Foundational Communication Model

Event-Driven Contract Architecture

AXIOM and ACE communicate through:



events



schemas



contracts



state channels



NOT direct internal access.



Example

AXIOM sends:



{

&#x20; "intent": "modify\_ecology",

&#x20; "region": "northern\_basin",

&#x20; "parameters": {

&#x20;   "dragon\_population": +20,

&#x20;   "forest\_density": -10

&#x20; }

}

ACE resolves:



simulation consequences



resource impacts



fire probability



migration shifts



weather changes



Then returns state deltas.



This Separation Enables:

1\. Multiple Frontends

Eventually:



desktop IDE



tablet spatial interface



VR world sculpting



collaborative multiplayer editing



autonomous AI pipelines



All controlling ACE.



2\. Multiple Runtime Targets

ACE could eventually power:



games



simulations



military training



ecosystem modeling



procedural films



education environments



3\. Headless Simulation

ACE should run without rendering.



Massive long-term advantage.



Missing Systems You Probably Need

These are the hidden systems most people discover too late.



1\. Ontology Layer (VERY IMPORTANT)

You need:



a formal semantic world model.



Without this:

AI outputs become incoherent.



The ontology layer defines:



what entities are



relationships



simulation meanings



categories



constraints



affordances



Example:

A “dragon” is not:



mesh



stats



animation



It is:



Predator

Flying megafauna

Thermal generator

Ecological terraformer

Pack hierarchy participant

Atmospheric disruptor

This becomes critical for AI reasoning.



2\. Provenance \& Lineage System

You absolutely need:



who created what



what AI generated it



what prompt created it



what systems depend on it



rollback graphs



Without this:

AI-generated projects become unmaintainable.



3\. Simulation Observatory

You need:



tooling for understanding emergent systems.



Think:



heatmaps



ecological flows



economic graphs



faction pressure maps



migration visualizations



causality tracing



Otherwise you will not understand why your world behaves the way it does.



4\. Distributed Compute Layer

Long-term:

ACE simulation load becomes enormous.



Eventually you likely need:



simulation partitioning



async region simulation



cloud execution



distributed ecology



scalable AI simulation



5\. Temporal System

Massively important.



You need formal handling for:



timelines



causality



rollback



simulation rewinds



alternate histories



branching persistence



Especially for AI-assisted iteration.



6\. Constraint System

You need:



a formal rules/governance layer.



Otherwise AI agents break everything.



Constraints define:



allowable architecture



performance budgets



lore consistency



simulation laws



visual language



7\. Resource Compiler / Asset Distillation Layer

AI-generated content becomes massive and inefficient.



You need systems that:



optimize



compress



merge



deduplicate



canonicalize



Otherwise your projects explode in size and complexity.



8\. Institutional Memory System

This is likely one of your most important long-term systems.



Not chat history.



Actual:



decision records



architectural rationale



evolution tracking



rejected approaches



lessons learned



Otherwise you endlessly rediscover old mistakes.



Long-Term Structural Expansion

Eventually the stack probably becomes:



\[ User ]

&#x20;   ↓

\[ AXIOM ]

&#x20;   ↓

\[ Coordination Layer ]

&#x20;   ↓

\[ Knowledge/Ontology Layer ]

&#x20;   ↓

\[ ACE ]

&#x20;   ↓

\[ Distributed Infrastructure ]

Integration Plan

Now the important part.



You should NOT try to build all of this simultaneously.



That kills projects.



PHASE 1 — Establish Core Boundaries

Goal

Prevent architectural collapse.



Implement

ACE

minimal runtime



spatial scene



entity system



renderer



streaming



simulation tick



event system



AXIOM

conversational interface



project graph



live scene inspection



command routing



Critical

Establish strict API boundaries immediately.



PHASE 2 — Runtime Introspection

Goal

Make ACE observable.



Implement

ACE exposes:

runtime state channels



debug streams



entity graphs



simulation telemetry



AXIOM gains:

live overlays



simulation inspector



world query tools



This phase is HUGE.



You cannot scale emergent simulation blindly.



PHASE 3 — Semantic Layer

Goal

Teach the system meaning.



Implement

Ontology framework

entity categories



relationships



behaviors



affordances



Semantic tagging

assets



systems



regions



mechanics



AI context retrieval

project memory



dependency awareness



This is where AXIOM becomes genuinely powerful.



PHASE 4 — Agentic Production

Goal

AI starts producing subsystems.



Implement

Agent framework

task routing



dependency graphs



review loops



artifact pipelines



Human oversight layer

Critical.



Never allow unrestricted autonomous modification.



PHASE 5 — Spatial Intelligence

Goal

Sketch-to-world workflows.



Implement

Spatial interpretation

gesture mapping



2D → 3D mapping



semantic region marking



contextual references



This is one of your strongest differentiators.



PHASE 6 — Persistent World Intelligence

Goal

Continuous autonomous simulation.



Implement

Headless ACE runtime

regional simulation



async processing



distributed persistence



historical timelines



PHASE 7 — Civilization-Scale Tooling

Goal

Full ecosystem.



Implement

Collaborative systems

multi-user editing



AI organizations



distributed simulation workers



procedural governance



economy tooling



institutional memory



Recommended Technical Direction

ACE

Likely Good Fits

Rust/C++ hybrid



ECS initially



GPU-driven architecture



event streaming



data-oriented design



Vulkan/Metal/DX12 abstraction



eventual distributed simulation



AXIOM

Likely Good Fits

Electron/Tauri frontend



graph-native architecture



embedded LLM orchestration



semantic indexing



vector retrieval



multimodal interfaces



Most Important Advice

Do NOT think:



“We are building a game engine.”



You are not.



You are building:



a reality simulation substrate + cognitive civilization tooling stack.



That sounds grandiose, but structurally that is genuinely the trajectory your ideas imply.



The danger is not ambition.



The danger is uncontrolled abstraction.



Your survival depends on:



strict boundaries



modular contracts



observability



semantic consistency



ruthless scope control per phase



If you get the ACE ↔ AXIOM separation right early, almost everything else becomes extensible later. If you get it wrong, the project slowly ossifies into an AI-enhanced Unity clone with existential technical debt.

