---
name: game-loop-delta-time-runtime-cadence
description: Govern game-loop cadence, delta-time use, and performance budgets for ACE, AXIOM, and generated runtime worlds.
---

\# Game Loop Delta Time \& Runtime Cadence Skill v1



\## Purpose



This skill governs how ACE, AXIOM, Codex, and runtime-generation agents create game loops, runtime spaces, simulation fields, entity systems, overlays, terrain systems, and live world logic.



Its purpose is to prevent agents from accidentally placing expensive simulation, spatial rebuilds, AI decisions, pathfinding, field propagation, terrain updates, rendering overlays, or full-world scans directly inside every frame/tick.



Default rule:



> The render tick may run every frame.  

> Heavy simulation work must not run every frame unless explicitly justified, bounded, and budgeted.



This skill exists to protect frame rate, responsiveness, thermal load, and system stability.



\---



\## Trigger Conditions



Use this skill whenever the user asks to create, modify, or reason about:



\- game loops

\- tick functions

\- delta time

\- runtime spaces

\- live simulations

\- field systems

\- spatial fields

\- influence maps

\- voxel terrain

\- RTS logic

\- RPG world simulation

\- entity systems

\- AI behaviour loops

\- agent movement

\- pathfinding

\- physics-like systems

\- overlays and debug visualisers

\- procedural terrain or ecology

\- resource economies

\- combat simulations

\- world state propagation

\- "living world" logic

\- any system that updates repeatedly over time



Also use this skill when a request includes phrases like:



\- "every tick"

\- "runtime"

\- "live"

\- "constantly"

\- "always update"

\- "simulation"

\- "field"

\- "space"

\- "world"

\- "terrain"

\- "agents"

\- "units"

\- "frontline"

\- "influence"

\- "path intent"



\---



\## Core Principle



A game loop should separate:



1\. \*\*Frame-bound work\*\*

&#x20;  - rendering

&#x20;  - camera interpolation

&#x20;  - input sampling

&#x20;  - lightweight animation

&#x20;  - cheap per-entity movement integration



2\. \*\*Fixed-step simulation\*\*

&#x20;  - physics-style updates

&#x20;  - deterministic unit motion

&#x20;  - combat timing

&#x20;  - cooldowns

&#x20;  - stable gameplay logic



3\. \*\*Cadenced heavy work\*\*

&#x20;  - influence field rebuilds

&#x20;  - pathfinding refreshes

&#x20;  - tactical decisions

&#x20;  - voxel mesh updates

&#x20;  - fluid spread

&#x20;  - economy simulation

&#x20;  - AI planning

&#x20;  - expensive queries

&#x20;  - debug overlay rebuilds



4\. \*\*Event-driven work\*\*

&#x20;  - terrain edits

&#x20;  - unit spawned/destroyed

&#x20;  - building placed

&#x20;  - region ownership changed

&#x20;  - combat occurred

&#x20;  - path became blocked

&#x20;  - player entered area



5\. \*\*Background / async work\*\*

&#x20;  - large path searches

&#x20;  - world analysis

&#x20;  - nav rebuilds

&#x20;  - chunk mesh generation

&#x20;  - LLM/agent reasoning

&#x20;  - expensive diagnostics



The tick loop coordinates these systems.  

It should not personally do all the work.



\---



\## Mandatory Default Behaviour



When generating runtime code, agents must default to this pattern:



```txt

render frame:

&#x20;   calculate delta time

&#x20;   clamp delta time

&#x20;   sample input

&#x20;   run lightweight frame updates

&#x20;   accumulate fixed simulation time

&#x20;   run fixed simulation steps if due

&#x20;   advance cadenced timers

&#x20;   run only due cadenced jobs

&#x20;   process a limited queue of expensive work

&#x20;   render



Agents must not default to:



every frame:

&#x20;   scan all entities

&#x20;   rebuild all fields

&#x20;   recalculate all paths

&#x20;   rebuild all meshes

&#x20;   update all overlays

&#x20;   run all AI decisions

&#x20;   query the whole world

&#x20;   regenerate debug data



That is forbidden unless the world is tiny, the operation is proven cheap, and the generated code explicitly says why it is safe.



Delta Time Rules

Rule 1 - Always use delta time for frame-rate-independent motion



Movement, interpolation, cooldown decay, animation blend, resource trickle, and timers must be scaled by elapsed time.



Example:



position.x += velocity.x \* deltaTime;

cooldown = Math.max(0, cooldown - deltaTime);



Do not write frame-dependent logic like:



position.x += 1;

cooldown -= 1;



unless the code is inside a fixed simulation step and the unit is intentionally "per step".



Rule 2 - Clamp delta time



Large frame hitches must not explode physics, movement, or simulation.



Required default:



const rawDelta = (now - lastTime) / 1000;

const deltaTime = Math.min(rawDelta, 0.05);



Default clamp target:



0.05 seconds = max 20 FPS simulation step



For slower strategy games, 0.1 may be acceptable.

For physics-heavy action games, prefer 0.033 or lower.



Rule 3 - Use fixed timestep for deterministic simulation where needed



Gameplay-critical logic should prefer fixed simulation steps.



Default:



const FIXED\_STEP = 1 / 60;

let accumulator = 0;



function frame() {

&#x20; const now = performance.now();

&#x20; const deltaTime = Math.min((now - lastTime) / 1000, 0.05);

&#x20; lastTime = now;



&#x20; accumulator += deltaTime;



&#x20; while (accumulator >= FIXED\_STEP) {

&#x20;   fixedUpdate(FIXED\_STEP);

&#x20;   accumulator -= FIXED\_STEP;

&#x20; }



&#x20; render();

&#x20; requestAnimationFrame(frame);

}



Use this for:



physics-like simulation

deterministic unit movement

combat timing

collision-ish checks

lockstep/networkable logic

replayable simulations

Runtime Cadence Lanes



Every repeating system must be assigned to a cadence lane.



Lane A - Per Frame



Allowed:



render

camera smoothing

input sampling

lightweight visual interpolation

simple animation

tiny UI state refresh if cheap



Target cadence:



Every frame



Budget:



Very cheap only

Lane B - Fixed Step



Allowed:



deterministic motion

core gameplay state

cooldowns

small collision checks

small physics-like integrations



Target cadence:



30-60 Hz



Budget:



Small, predictable, bounded

Lane C - Fast Cadence



Allowed:



local AI steering

nearby threat checks

short-range perception

simple targeting

selected unit logic



Target cadence:



100-250 ms



Budget:



Moderate, spatially bounded

Lane D - Medium Cadence



Allowed:



influence field updates

faction front pressure

tactical scoring

HUD summaries

debug overlay rebuilds

local nav refresh

chunk visibility checks



Target cadence:



250-1000 ms



Budget:



Moderate to heavy, must be bounded

Lane E - Slow Cadence



Allowed:



economy simulation

settlement planning

world ecology

strategic AI

large region analysis

long-term memory/state summaries



Target cadence:



1-10 seconds



Budget:



Heavy but infrequent

Lane F - Event Driven



Allowed:



terrain edit propagation

voxel remesh

path invalidation

building placement effects

faction ownership updates

one-off recalculations after state change



Target cadence:



Only when relevant state changes



Budget:



Heavy work allowed only if scoped to dirty regions

Lane G - Background / Async



Allowed:



large pathfinding

chunk mesh generation

expensive world analysis

AI planning

LLM calls

repo/tool diagnostics



Target cadence:



Queued, budgeted, async where possible



Budget:



Must not block render loop

Required Runtime Space Design



When creating a runtime space, agents must define:



1\. What updates every frame?

2\. What updates at fixed timestep?

3\. What updates on cadence timers?

4\. What updates only when dirty/events occur?

5\. What can be async/background?

6\. What is the per-frame budget?

7\. What is the maximum entity/chunk/field count assumed?

8\. What degrades first when performance drops?



If this is not defined, the implementation is incomplete.



Heavy Work Protection Rules

Rule 1 - No full-world scans every frame



Forbidden by default:



for (const tile of allTiles) {

&#x20; for (const unit of allUnits) {

&#x20;   computeInfluence(tile, unit);

&#x20; }

}



inside a per-frame tick.



Allowed only if:



the map is tiny,

the operation is clearly temporary/debug-only,

or the loop is moved to a slower cadence.

Rule 2 - Use dirty flags



When world state changes, mark affected regions dirty.



Example:



function editTerrain(chunkId, edit) {

&#x20; applyEdit(chunkId, edit);

&#x20; dirtyChunks.add(chunkId);

&#x20; dirtyInfluenceRegions.add(getRegionForChunk(chunkId));

}



Then process limited work:



function processDirtyChunks(maxChunksPerFrame = 2) {

&#x20; let processed = 0;



&#x20; for (const chunkId of dirtyChunks) {

&#x20;   rebuildChunkMesh(chunkId);

&#x20;   dirtyChunks.delete(chunkId);



&#x20;   processed++;

&#x20;   if (processed >= maxChunksPerFrame) break;

&#x20; }

}

Rule 3 - Use spatial partitioning



Agents must prefer spatial lookups over scanning every entity.



Use:



grid buckets

quadtrees

octrees

chunk maps

sector maps

broadphase collision grids

faction region maps



Default pattern:



const nearby = spatialGrid.queryRadius(position, radius);



not:



const nearby = allEntities.filter(e => distance(e.position, position) < radius);



unless entity counts are tiny.



Rule 4 - Stagger updates



Do not update every entity's expensive AI on the same frame.



Use update spreading:



const bucket = frameIndex % AI\_BUCKET\_COUNT;



for (const unit of units) {

&#x20; if (unit.updateBucket !== bucket) continue;

&#x20; unit.think(deltaTime);

}

Rule 5 - Budget queued work



Expensive queues must have a per-frame or per-cadence budget.



Example:



function processJobQueue(maxMs = 2.0) {

&#x20; const start = performance.now();



&#x20; while (jobQueue.length > 0 \&\& performance.now() - start < maxMs) {

&#x20;   const job = jobQueue.shift();

&#x20;   job.run();

&#x20; }

}

Rule 6 - Cache derived data



If the data is expensive and does not change every frame, cache it.



Examples:



influence fields

path maps

region ownership

debug overlays

terrain chunk meshes

visibility graphs

flow fields



Rebuild only when:



source state changes,

a cadence timer expires,

or a dirty region is marked.

Rule 7 - Separate visual smoothing from simulation



Simulation may update at lower cadence.

Visuals can interpolate every frame.



Example:



entity.visualPosition.lerp(entity.simPosition, 1 - Math.exp(-12 \* deltaTime));



This gives smooth motion without recalculating heavy logic every frame.



Default Runtime Loop Template



Use this as the default JS/HTML/Three.js-style loop:



const RuntimeClock = {

&#x20; lastTime: performance.now(),

&#x20; accumulator: 0,

&#x20; frameIndex: 0,



&#x20; fixedStep: 1 / 60,

&#x20; maxDelta: 0.05,



&#x20; timers: {

&#x20;   aiFast: 0,

&#x20;   fieldRebuild: 0,

&#x20;   hud: 0,

&#x20;   economy: 0,

&#x20;   overlay: 0,

&#x20; },

};



function animate() {

&#x20; requestAnimationFrame(animate);



&#x20; const now = performance.now();

&#x20; const rawDelta = (now - RuntimeClock.lastTime) / 1000;

&#x20; const deltaTime = Math.min(rawDelta, RuntimeClock.maxDelta);

&#x20; RuntimeClock.lastTime = now;

&#x20; RuntimeClock.frameIndex++;



&#x20; sampleInput();



&#x20; RuntimeClock.accumulator += deltaTime;

&#x20; while (RuntimeClock.accumulator >= RuntimeClock.fixedStep) {

&#x20;   fixedUpdate(RuntimeClock.fixedStep);

&#x20;   RuntimeClock.accumulator -= RuntimeClock.fixedStep;

&#x20; }



&#x20; updateFrameVisuals(deltaTime);

&#x20; updateCadencedSystems(deltaTime);

&#x20; processRuntimeQueues(2.0);



&#x20; renderer.render(scene, camera);

}



function updateCadencedSystems(deltaTime) {

&#x20; RuntimeClock.timers.aiFast += deltaTime;

&#x20; RuntimeClock.timers.fieldRebuild += deltaTime;

&#x20; RuntimeClock.timers.hud += deltaTime;

&#x20; RuntimeClock.timers.economy += deltaTime;

&#x20; RuntimeClock.timers.overlay += deltaTime;



&#x20; if (RuntimeClock.timers.aiFast >= 0.15) {

&#x20;   RuntimeClock.timers.aiFast = 0;

&#x20;   updateAIBucket(RuntimeClock.frameIndex);

&#x20; }



&#x20; if (RuntimeClock.timers.fieldRebuild >= 0.45) {

&#x20;   RuntimeClock.timers.fieldRebuild = 0;

&#x20;   rebuildDirtyOrVisibleFields();

&#x20; }



&#x20; if (RuntimeClock.timers.overlay >= 0.5) {

&#x20;   RuntimeClock.timers.overlay = 0;

&#x20;   refreshDebugOverlayIfVisible();

&#x20; }



&#x20; if (RuntimeClock.timers.hud >= 0.25) {

&#x20;   RuntimeClock.timers.hud = 0;

&#x20;   updateHudSummary();

&#x20; }



&#x20; if (RuntimeClock.timers.economy >= 2.0) {

&#x20;   RuntimeClock.timers.economy = 0;

&#x20;   updateEconomySimulation();

&#x20; }

}

Unreal / C++ Default Pattern



For Unreal-style runtime code, do not place heavy scans directly in Tick.



Allowed in Tick:



void AMyRuntimeActor::Tick(float DeltaTime)

{

&#x20;   Super::Tick(DeltaTime);



&#x20;   UpdateLightweightVisuals(DeltaTime);

&#x20;   AccumulateTimers(DeltaTime);

&#x20;   ProcessSmallRuntimeBudget();

}



Prefer timers for heavier work:



GetWorldTimerManager().SetTimer(

&#x20;   FieldUpdateHandle,

&#x20;   this,

&#x20;   \&AMyRuntimeActor::RebuildInfluenceFields,

&#x20;   0.45f,

&#x20;   true

);



Use Tick for:



visual interpolation

tiny movement updates

lightweight state polling



Use timers or task systems for:



field rebuilds

tactical decisions

nav refreshes

expensive spatial queries

chunk rebuilds

debug overlay refreshes

Default Cadence Recommendations

System	Default Update Method	Suggested Cadence

Rendering	per frame	monitor refresh

Input sampling	per frame	every frame

Camera smoothing	per frame	every frame

Character movement	fixed step / per frame with delta	30-60 Hz

Combat cooldowns	fixed step or delta	30-60 Hz

Simple AI steering	cadence bucket	100-250 ms

Tactical AI decisions	cadence bucket	250-1000 ms

Influence fields	cadence or dirty regions	250-1000 ms

Pathfinding	event/async/cadence	as needed

Voxel mesh rebuild	dirty chunk queue	budgeted

Fluid spread	cadence	500-2000 ms

Economy	slow cadence	1-10 s

Debug overlays	cadence/visible only	250-1000 ms

LLM/agent reasoning	async queue	never in frame loop

Runtime Space Acceptance Criteria



Any generated runtime-space implementation must pass these checks:



Required

Uses deltaTime

Clamps large delta spikes

Separates render/frame update from heavy simulation

Uses timers or cadence lanes for heavy work

Defines update frequency for major subsystems

Avoids full-world scans every frame

Uses dirty flags for terrain/chunk/field rebuilds where applicable

Has a budgeted queue for expensive jobs where applicable

Updates debug overlays only when visible or cadenced

Provides comments explaining cadence decisions

Rejected



Reject the implementation if it:



rebuilds all spatial fields every frame

recalculates all pathfinding every frame

scans all entities against all entities every frame

rebuilds all terrain/chunk meshes every frame

updates every AI brain every frame with expensive logic

runs LLM/model calls in the frame loop

updates debug overlays every frame without need

lacks delta time

lacks cadence/budgeting for heavy work

has no stated performance assumptions

Prompt Behaviour For Agents



When an agent receives a request like:



"Create a runtime space for units and influence fields"



it must not jump straight into a single tick() that does everything.



It must respond or implement using this structure:



Runtime architecture:

\- Frame loop:

\- Fixed update:

\- Fast cadence:

\- Medium cadence:

\- Slow cadence:

\- Event-driven updates:

\- Dirty queues:

\- Performance safeguards:



If producing code, the agent must include cadence comments near each subsystem.



Example Correct Response Shape

I will create the runtime space with the following update model:



\- Render/camera/input: every frame

\- Unit movement: fixed 60 Hz step

\- Local steering: staggered across 6 buckets at \~150 ms

\- Influence field rebuild: dirty regions only, max every 450 ms

\- Pathfinding: queued, max 2 ms per frame

\- Debug overlay: only when visible, max twice per second

\- Economy/resource simulation: once every 2 seconds



I will not rebuild all fields or scan all entities every tick.

Example Bad Response Shape

Every tick:

\- update all units

\- rebuild all fields

\- update all paths

\- update all overlays

\- update all resources

\- recalculate all threats



This is rejected.



ACE / AXIOM Governance Rule



For ACE and AXIOM patch generation:



Runtime loop changes are not accepted unless they include:



1\. cadence declaration

2\. heavy-work protection

3\. delta-time handling

4\. bounded update scope

5\. performance-risk note

6\. validation plan



Runtime patches must be treated as performance-sensitive changes.



If a generated patch adds a new repeated system without cadence/budget rules, QA should flag:



runtime\_tick\_heavy\_work\_risk



Severity:



high



Suggested QA message:



Rejected: repeated runtime work lacks cadence/budget protection. Heavy computation appears to run every frame or without a bounded update lane.



This fits ACE's wider direction: changes should be governed and preflighted before activation, rather than letting external tools shove risky runtime code straight into the system.



Validation Tests



A generated runtime loop should be inspected for:



\- requestAnimationFrame / Tick / update loop exists

\- delta time is calculated

\- delta time is clamped

\- fixed timestep exists where needed

\- timers/cadences exist for heavy subsystems

\- no obvious full-world scan in per-frame path

\- queues are budgeted

\- debug overlays are visibility/cadence gated

\- comments identify performance-sensitive areas



Optional runtime checks:



\- log average frame time

\- log max frame spike

\- count jobs processed per frame

\- count skipped/deferred jobs

\- expose runtime cadence diagnostics

Runtime Diagnostics Payload



When useful, expose:



{

&#x20; "runtimeCadence": {

&#x20;   "frameDeltaMs": 16.7,

&#x20;   "fixedStepsThisFrame": 1,

&#x20;   "queuedJobs": 12,

&#x20;   "jobsProcessed": 3,

&#x20;   "fieldRebuildDue": false,

&#x20;   "dirtyChunks": 4,

&#x20;   "aiBucket": 2,

&#x20;   "overlayVisible": true,

&#x20;   "lastFieldRebuildMs": 1.4,

&#x20;   "lastQueueBudgetMs": 2.0

&#x20; }

}



Do not make this canonical truth unless explicitly wired through ACE/AXIOM truth publication.



Final Rule



A runtime space is not "alive" because everything runs every tick.



A runtime space is alive when:



cheap things update smoothly,

expensive things update intelligently,

stale regions are refreshed when needed,

dirty regions are prioritised,

visible systems feel continuous,

and the frame rate does not get murdered for no good reason.



Do not build frame-rate arson.





Bluntly: this should become one of our default runtime-generation skills. Any AXIOM/ACE command that creates "living fields", "runtime spaces", "agent worlds", "simulation layers", or "voxel terrain" should be filtered through this before code lands.

