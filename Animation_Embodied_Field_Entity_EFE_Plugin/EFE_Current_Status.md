Regression pass completed - 2026-05-16

Root cause:

The new native cockpit was a truthful C++ snapshot viewer, but it regressed the older browser-side test-bench affordances. It had no run loop, no step/reset, no camera orbit/pan/zoom, and only three exported states. The richer controls still existed in wyvern_efe_musculotendon_v4.html, but that file is a legacy browser-side sandbox rather than the native C++ truth path.

Fix:

- efe_native_cockpit.html now has run, step, reset, previous/next, frame select, orbit/pan mode, drag navigation, wheel zoom, layer toggles, exported-state buttons, and a link to the legacy sandbox.
- efe_slice6_8_snapshot_export.cpp now exports 11 native C++ frames: idle, pursue, evade, takeoff, glide, wind-field glide, left-wing damage glide, dive, strike, intimidate, and land.
- The native cockpit remains read-only over exported C++ data; it does not reintroduce a second browser-side physics truth.
- wyvern_efe_musculotendon_v4.html remains the best current playground for the older live-feel prototype controls and visual motion sandbox.

Validation:

- Browser load check passed in the in-app browser at http://127.0.0.1:8766/efe_native_cockpit.html with no console warnings/errors.
- Terminal Playwright regression passed: 11 frames loaded, run advanced frame 0 to 1, step advanced 1 to 2, reset returned to frame 0, pan changed camera panX/panY, wheel zoom changed camera zoom, damage frame selected index 6 with 2 damaged native nodes, and canvas was nonblank.
- Legacy sandbox check passed: wyvern_efe_musculotendon_v4.html still exposes run, step, reset, intent select, wing/spine damage, wind, and the camera canvas.
- Screenshot evidence:
  - output/playwright/efe_native_cockpit_regression.png
  - output/playwright/wyvern_efe_musculotendon_v4_regression.png
- Full C++ smoke regression passed:
  - slice1 ok: nodes=23 constraints=22 groundNodes=2 gaitPhase=0.005 breathPhase=0.005
  - slice2 ok: phase=airborne liftReserve=1.28399 verticalVelocity=0.727241 failureReason=insufficient_lift_reserve
  - slice3 ok: muscles=10 active=6 force=475.9 disabledForce=0
  - slice4 ok: panels=8 lift=1273 drag=292.352 asymL=0 asymR=636.5 stallL=1 stallR=1
  - slice5 ok: dirty=8 cappedProcessed=12 active=92 uncappedProcessed=27 totalCells=512
  - slice6_8 ok: frames=11 nodes=23 muscles=10 panels=8 maxLift=959.857 file=efe_native_snapshot.js

Remaining work:

- Convert the snapshot cockpit to a live native/WASM stepping bridge.
- Add true native modifiers in the cockpit for wind/damage/intent instead of selecting pre-exported scenario frames.
- Replace procedural preview lines/membranes with real mesh skin binding.
- Add stronger joint limits/stabilization, terrain contact, landing recovery, and renderer materials.
- Clean the existing C4100 placeholder warnings in older hooks.

Slices 6-8 brief pass completed - 2026-05-16

Goal:

Land the minimum native-to-HTML skin preview path so the current simulation can be inspected before the real skin/mesh pass.

Evidence:

- Added a read-only render-frame contract that exports morphology nodes, constraints, muscle state, wing panels, forces, and high-level sim metrics from native C++.
- Added a fixed-step runner with substep limits, velocity clamping, non-finite checks, and fail-safe stats.
- Added a native snapshot exporter that runs multiple native entity states and writes efe_native_snapshot.js.
- Added efe_native_cockpit.html as a static canvas cockpit wired only to the exported native snapshot, not a separate HTML simulation.
- Browser smoke test loaded the cockpit, selected the glide frame, found native frames, 23 nodes, 22 constraints, 10 muscles, 8 wing panels, todo items, no console/page errors, and nonblank canvas pixels.
- Screenshot evidence: output/playwright/efe_native_cockpit.png
- MSVC C++17 exporter output:

  slice6_8 ok: frames=11 nodes=23 muscles=10 panels=8 maxLift=959.857 file=efe_native_snapshot.js

Remaining work before calling this a polished usable sim:

- Replace procedural tubes and wing membranes with real mesh/skin binding.
- Expose live native frames through a proper engine/WASM bridge instead of a generated JS snapshot.
- Add joint limits and better stabilization; current glide still shows velocity clamping/fail-safe stats.
- Add contact state, terrain/landing fields, and landing recovery.
- Add real renderer materials, skin weights, surface layers, and visual damage.
- Turn the cockpit from read-only snapshot inspection into a live stepping/debug UI.
- Clean the existing placeholder C4100 warnings in older hooks.

Slice 5 completed - 2026-05-16

Goal:

Spatial fields now have native performance guardrails before more environment truth is added.

Evidence:

- FieldDescriptor now owns field update budget policy: tickRateHz, activeValueThreshold, activePaddingCells, and maxActiveCellsPerTick.
- SpatialFieldGrid now tracks dirty cells from emit()/emitSphere(), carries active cells between ticks, builds a padded active workset, and can cap processed cells per tick.
- SpatialFieldGrid::tick() now honors per-field tick rates instead of forcing every registered field to advance every simulation tick.
- Decay and propagation now run through the active workset path used by tick(), so field updates can stay local to emitted/active regions.
- FieldTickStats reports ticks run/skipped, dirty cells, active cells, processed cells, decay/propagation counts, simulated dt, accumulated dt, and budget capping.
- FieldRegistry now aggregates per-field tick stats so debug tooling can read field count, ticked/skipped fields, processed cells, active cells, dirty cells, and budget cap state.
- Smoke test validates tick-rate skip, dirty-cell persistence across skipped ticks, budget capping, registry aggregation, active-cell carry, sample availability, and uncapped active updates touching less than the full grid.
- MSVC C++17 smoke executable output:

  slice5 ok: dirty=8 cappedProcessed=12 active=92 uncappedProcessed=27 totalCells=512

Regression evidence:

- slice1 ok: nodes=23 constraints=22 groundNodes=2 gaitPhase=0.005 breathPhase=0.005
- slice2 ok: phase=airborne liftReserve=1.28399 verticalVelocity=0.727241 failureReason=insufficient_lift_reserve
- slice3 ok: muscles=10 active=6 force=475.9 disabledForce=0
- slice4 ok: panels=8 lift=1273 drag=292.352 asymL=0 asymR=636.5 stallL=1 stallR=1

Slice 4 completed - 2026-05-16

Goal:

Wing panel aero v0 now exists in native C++ and replaces the single lift blob for glide and take-off lift reserve.

Evidence:

- MotorConfig now exposes native panel aero tuning: panels per side, air density, base/zero-lift AoA, lift slope, stall angle, powered AoA boost, powered airspeed floor, and flap thrust coefficient.
- MotorState now owns aero debug truth: total lift, drag, thrust, lift reserve, left/right AoA, left/right stall, panel count, centre of lift, lift vector, drag vector, and left/right wing load.
- MotorSolver now computes lift/drag/thrust through computeWingPanelAero() for both TakeOff and Glide.
- TakeOff lift reserve no longer uses the old wingAvailability/availableLift scalar path.
- Glide no longer emits one shared lift blob; it emits per-panel force decisions.
- Powered take-off biases panel relative flow toward the intended forward stroke so upward launch velocity does not collapse lift reserve mid-launch.
- SurfaceExpression mirrors native aero debug values read-only for renderer/debug overlays.
- Smoke test validates 8 panels, lift/drag, expression mirroring, damaged-wing asymmetry, and stall signaling.
- MSVC C++17 smoke executable output:

  slice4 ok: panels=8 lift=1273 drag=292.352 asymL=0 asymR=636.5 stallL=1 stallR=1

Regression evidence:

- slice1 ok: nodes=23 constraints=22 groundNodes=2 gaitPhase=0.005 breathPhase=0.005
- slice2 ok: phase=airborne liftReserve=1.28399 verticalVelocity=0.727241 failureReason=insufficient_lift_reserve
- slice3 ok: muscles=10 active=6 force=475.9 disabledForce=0

Slice 3 completed - 2026-05-16

Goal:

Native musculotendon bridge now exists in C++ and is wired into the entity tick path.

Evidence:

- Added MuscleUnit, MuscleGraph, MuscleSolver, MuscleActivationFrame, typed MuscleRole activations, tendon/passive force, fatigue, health, and pull-only force application.
- EmbodiedEntity now owns a MuscleGraph and runs MuscleSolver after MotorSolver and before MorphologyGraph::resolve().
- MotorSolver writes role-based muscle activations during TakeOff, Glide, and Breathe.
- buildDragon() now attaches 10 native muscles to morphology node IDs.
- SurfaceExpression reads native muscle tension stats instead of only velocity heuristics when muscles are active.
- Smoke test validates activation, force application, expression output, and zero force when muscle health is disabled.
- MSVC C++17 smoke executable output:

  slice3 ok: muscles=10 active=6 force=475.9 disabledForce=0

Slice 2 completed - 2026-05-16

Goal:

TakeOff intent now produces a native grounded-to-airborne transition in MotorSolver.

Evidence:

- IntentType::TakeOff is dispatched to solveTakeOff().
- MotorState now owns take-off phase, readiness, lift reserve, clearance, vertical velocity, and typed failure reason.
- solveTakeOff() runs crouch/load, hind-leg shove, wing-assisted first downstroke, tail stabilisation, lift reserve check, clearance check, vertical velocity check, and Airborne transition.
- SurfaceExpression mirrors take-off debug values read-only for renderer/debug overlays.
- Smoke test validates both success and failure paths.
- MSVC C++17 smoke executable output:

  slice2 ok: phase=airborne liftReserve=2.7436 verticalVelocity=0.727241 failureReason=insufficient_lift_reserve

Slice 1 completed - 2026-05-16

Goal:

buildDragon() now returns a real populated native entity instead of rebuilding an empty entity after the morphology graph is constructed.

Evidence:

- buildDragon() preserves the populated MorphologyGraph on the returned EmbodiedEntity.
- Native validation hook confirms nodes > 0 and constraints > 0.
- rootNode, headNode, tailTipNode, wingLTipNode, wingRTipNode, and ground contact nodes resolve to real morphology nodes.
- Smoke test tick changes motor/expression state.
- MSVC C++17 smoke executable output:

  slice1 ok: nodes=23 constraints=22 groundNodes=2 gaitPhase=0.005 breathPhase=0.005

Revised assessment: what we have vs what we still need

1\. Native entity architecture



Status: strong



You have:



&#x20;Native EmbodiedEntity

&#x20;Morphology graph body

&#x20;Intent stack

&#x20;Motor solver

&#x20;Field registry

&#x20;Surface expression output

&#x20;LOD tick modes

&#x20;Read-only expression frame for the renderer

&#x20;Clear dataflow from intent → motor → body → expression



The architecture summary literally says entities read/write world fields, motor solving converts intent/fields/body into forces, morphology resolves constraints, then surface expression outputs the visible residue.



Verdict: keep this. This is the spine of the whole approach.



2\. Current critical bug

Update 2026-05-16: this blocker is resolved by Slice 1. The original diagnosis below is retained as historical context for why the fix mattered.



Status: fixed in Slice 1



dragon\_builder.h still has the “hollow dragon” problem.



It builds the body, then recreates the entity with the corrected config and does not repopulate the morphology graph. The comment says the body repopulation is omitted for brevity.



So before anything else:



buildDragon()

must return a populated body:

\- nodes > 0

\- constraints > 0

\- root node valid

\- head node valid

\- tail tip valid

\- wing tips valid

\- ground contact nodes valid



Until that is fixed, the C++ side can look clever while quietly returning a cardboard box with “dragon” written on it.



3\. Spatial fields / volumes



Status: good foundation, needs performance discipline



You have field types for:



&#x20;airflow

&#x20;pressure

&#x20;temperature

&#x20;sound propagation

&#x20;visibility

&#x20;territorial dominance

&#x20;fear/stress

&#x20;terrain stability

&#x20;momentum flow

&#x20;ecological density



The field system is designed as layered scalar/vector grids where entities read and write values, with cheap linear propagation as the current default and a hook for heavier fluid simulation later.



Still needed:



&#x20;active field chunks only

&#x20;dirty-cell propagation

&#x20;field update rate caps

&#x20;per-field tick frequency

&#x20;local active volume around each entity

&#x20;field importance/priority scoring

&#x20;terrain height field

&#x20;obstacle field

&#x20;landing viability field

&#x20;thermal/updraft field

&#x20;turbulence/wind gust field

&#x20;wingtip clearance field



Performance rule:



Do not update all fields globally every frame.

Update active cells, near active entities, at field-specific rates.



Example:



body physics:       60 Hz

surface expression: 60 Hz

airflow local:      20–30 Hz

fear/territory:     5–10 Hz

ecology density:    1–2 Hz

far entities:       abstract only



That keeps the creature alive without setting the laptop on fire. Which is generally preferable.



4\. Morphology / body simulation



Status: good foundation



You have:



&#x20;body as nodes/mass points

&#x20;constraints/springs

&#x20;structural HP

&#x20;damage propagation

&#x20;centre of mass functions used by solver/expression

&#x20;constraint resolution path

&#x20;LOD-aware body ticking

&#x20;dragon builder attempt with spine, tail, wings, and hind legs



Still needed:



&#x20;fix buildDragon() body population

&#x20;joint angle limits

&#x20;wing root torque limits

&#x20;membrane panel nodes

&#x20;centre of lift calculation

&#x20;per-limb contact state

&#x20;stable substepping

&#x20;solver iteration budget by LOD

&#x20;structural stress debug

&#x20;crash/fall/failure state logging



Recommended stability rule:



Full body sim uses fixed timestep + max substeps.

Never let variable frame rate directly control physics.



So:



accumulator += frameDt

while accumulator >= fixedDt:

&#x20;   simTick(fixedDt)

&#x20;   accumulator -= fixedDt



Boring? Yes. Necessary? Also yes. Physics loves nothing more than punishing optimism.



5\. Motor solver



Status: good, but currently force-rule based



The motor solver reads fields at the entity position, processes intents, optionally uses an external locomotion policy, applies balance, reacts to wind, and writes force applications into the morphology graph.



You have:



&#x20;pursue

&#x20;evade

&#x20;glide

&#x20;dive

&#x20;land

&#x20;strike

&#x20;parry

&#x20;intimidation

&#x20;protection/recovery style intents

&#x20;fatigue

&#x20;wing loading

&#x20;airflow sampling

&#x20;balance correction



Still needed:



&#x20;TakeOff solver

&#x20;proper climb solver

&#x20;proper flap solver

&#x20;per-wing asymmetric control

&#x20;roll/yaw/pitch torque model

&#x20;stall detection

&#x20;failed take-off state

&#x20;failed landing state

&#x20;wing clearance checks

&#x20;local terrain reaction

&#x20;intent conflict resolution tests



Current issue: flight exists mostly as glide/lift, not full flap → thrust → climb → stabilise.



6\. Musculotendon animation/actuation

Update 2026-05-16: Slice 3 adds the first native C++ musculotendon bridge. The HTML prototype remains reference material, not runtime truth.



Status: v0 native bridge implemented, needs refinement



The HTML wyvern sim has the right biological ideas: muscle units have origin/insertion, optimal length, max force, activation, fatigue, tendon slack/stiffness, force-length, force-velocity, tendon elasticity, and pull-only forces.



You have in prototype:



&#x20;pectoralis downstroke

&#x20;supracoracoideus-style upstroke

&#x20;wrist/finger extension

&#x20;wing folding on upstroke

&#x20;neck flexor/extensor

&#x20;tail elevator/depressor

&#x20;leg tuck

&#x20;fatigue

&#x20;tendon force

&#x20;visual muscle activation



Still needed in native code:



&#x20;MuscleUnit

&#x20;MuscleGraph

&#x20;MuscleSolver

&#x20;muscle attachment to morphology nodes

&#x20;activation frame from motor solver

&#x20;tendon/passive force accumulation

&#x20;antagonist pair balancing

&#x20;muscle fatigue affecting available force

&#x20;muscle damage affecting motion

&#x20;muscle debug overlay



This is probably the most important bridge after fixing dragon\_builder.



The native goal should become:



Intent → MotorSolver → MuscleActivations → MuscleSolver → MorphologyGraph forces → SurfaceExpression



Not:



Intent → direct velocity magic



Direct velocity magic is how we get cursed table-dragon levitation. We’re better than that. Mostly.



7\. Flight physics



Status: partial



You have:



&#x20;simplified lift

&#x20;simplified drag

&#x20;air density constant

&#x20;airflow/updraft bonus

&#x20;wing L/R load output

&#x20;glide

&#x20;dive

&#x20;landing placeholder



The motor solver itself labels the current flight model as approximate and says true aerodynamics needs per-panel normals and angle of attack.



Still needed:



&#x20;per-wing-panel lift

&#x20;wing panel surface normal

&#x20;angle of attack

&#x20;stall angle

&#x20;flap-generated thrust

&#x20;flap-generated lift

&#x20;wingbeat phase in native code

&#x20;glide ratio

&#x20;lift reserve

&#x20;centre of lift

&#x20;ground effect

&#x20;wind-relative velocity

&#x20;asymmetric wing damage effects

&#x20;body/tail drag



Recommended first native flight model:



8–12 wing panels per wyvern.

Not hundreds.

Each panel computes:

\- relative air velocity

\- surface normal

\- angle of attack

\- lift

\- drag

\- stall factor



That gives believable behaviour without going full CFD. Full CFD is where projects go to be found dead in a ditch.



8\. Take-off

Update 2026-05-16: Slice 2 adds native TakeOff v0. The remaining items here are now refinement work, not the initial missing behavior.



Status: v0 implemented, needs refinement



You need this to make the wyvern feel real.



Checklist:



&#x20;IntentType::TakeOff

&#x20;solveTakeOff()

&#x20;grounded check

&#x20;crouch/compression phase

&#x20;hind-leg impulse

&#x20;wing-assisted shove

&#x20;first downstroke

&#x20;minimum lift reserve

&#x20;minimum clearance

&#x20;vertical velocity threshold

&#x20;transition to inFlight

&#x20;failed launch reason

&#x20;launch debug overlay



Suggested sequence:



crouch

→ load tendons/legs

→ shove from hind legs

→ wing downstroke impulse

→ tail stabilise

→ if vertical velocity + lift reserve pass threshold: airborne

→ else stumble/fail



This should be the first “real dragon” moment.



9\. Landing



Status: placeholder



Current landing is mostly braking/anti-grav style logic. Useful, but not believable enough long term.



Checklist:



&#x20;target landing zone

&#x20;approach vector

&#x20;descent rate

&#x20;flare timing

&#x20;wing braking

&#x20;tail braking

&#x20;leg extension

&#x20;contact detection

&#x20;impact absorption

&#x20;stumble/skid

&#x20;terrain material/grip

&#x20;failed landing reason

&#x20;landing debug overlay



Landing does not need to be perfect yet. Take-off comes first.



10\. Surface expression / render output



Status: strong



This is the correct replacement for “animation compatibility with tools”.



Surface expression already outputs speed, direction, gait, in-air state, alertness, aggression, exhaustion, fear, pain, wing damage, spinal damage, tail damage, breathing, muscle flex, skin stretch, impact ripple, and bone hints. It is explicitly read-only and has no effect on physics/gameplay.



Keep this rule:



Simulation owns truth.

SurfaceExpression only describes how truth should look.



Still needed:



&#x20;native renderer consumption

&#x20;procedural pose system

&#x20;skin/membrane deformation output

&#x20;bone/node visual mapping

&#x20;mesh deformation from morphology nodes

&#x20;wing membrane renderer

&#x20;debug draw of expression values

&#x20;proof expression never mutates sim state



No import/export nonsense needed.



The renderer can consume:



MorphologyGraph node positions

ExpressionFrame values

BoneHint-style pose hints

Muscle tension values

Field samples



That is our native entity visual pipeline.



11\. Debug tooling



Status: already useful



The debug visualiser shows simulation controls, top-down spatial fields, morphology node health, intent stack, active forces, and surface expression output.



You have:



&#x20;tick/run/step

&#x20;intent switching

&#x20;damage button

&#x20;wind burst

&#x20;airflow/fear/territory display

&#x20;node health

&#x20;active forces

&#x20;expression frame bars



Still needed:



&#x20;centre of mass overlay

&#x20;centre of lift overlay

&#x20;lift vector

&#x20;drag vector

&#x20;thrust vector

&#x20;gravity vector

&#x20;wing panel normals

&#x20;stall warning

&#x20;take-off readiness

&#x20;landing readiness

&#x20;per-field tick cost

&#x20;per-entity sim cost

&#x20;active cell count

&#x20;solver iteration count

&#x20;why-did-I-fail log



The debug overlay should become your “truth cockpit”.



Performance/stability checklist



This is the big one for your concern.



Simulation stability

&#x20;fixed timestep

&#x20;max substeps per frame

&#x20;clamp extreme forces

&#x20;clamp max velocity

&#x20;clamp max angular/constraint error

&#x20;separate impulse vs continuous force

&#x20;deterministic update order

&#x20;stable constraint iteration budget

&#x20;sleep/rest state for inactive entities

&#x20;no unbounded field accumulation

&#x20;decay/normalise all long-lived fields

&#x20;log solver explosions

&#x20;fail safe into ragdoll/fall state, not NaN soup

Field performance

&#x20;chunked field volumes

&#x20;active chunks only

&#x20;dirty-cell list

&#x20;field update frequency per field type

&#x20;field resolution per field type

&#x20;entity-local high-res fields

&#x20;world/global low-res fields

&#x20;sparse emission

&#x20;decay before propagation

&#x20;cap max emitters per field per tick

&#x20;sample fields, don’t scan fields

&#x20;profile cell count and update cost

Creature performance

&#x20;full sim only for hero/near entities

&#x20;reduced sim for mid-distance entities

&#x20;abstract sim for far entities

&#x20;culled sim for irrelevant entities

&#x20;cap node count per creature type

&#x20;cap muscle count per creature type

&#x20;cap wing panel count

&#x20;cache rest lengths

&#x20;avoid per-frame allocation

&#x20;use structure-of-arrays later if needed

&#x20;batch entities by LOD

&#x20;profile per-entity tick time

Recommended budgets for first working version

Hero wyvern:

&#x20; 30–80 morphology nodes

&#x20; 20–60 constraints

&#x20; 12–30 muscles

&#x20; 8–16 wing panels

&#x20; 60 Hz body tick

&#x20; 20 Hz local fields

&#x20; 60 Hz expression/render output



Regular nearby creature:

&#x20; 15–30 nodes

&#x20; 8–20 constraints

&#x20; 0–12 muscles

&#x20; simplified wing panels

&#x20; 30–60 Hz body tick



Far creature:

&#x20; 1 position body

&#x20; intent + field emission only

&#x20; 5–10 Hz



That is sane. Trying 500 nodes, 300 muscles, and 40 fields at 60 Hz for every creature would be goblin engineering. Fun, briefly, then smoke.



Revised next build order

Current cursor after Slices 6-8 brief pass: inspect the native cockpit, then choose between live native bridge, mesh/skin binding, or stabilization/landing as the next narrow slice.

Slice 1 — Fix native dragon builder



Goal:



buildDragon() returns a real populated native entity.



Must prove:



nodes > 0

constraints > 0

rootNode valid

headNode valid

tailTipNode valid

wing tips valid

ground nodes valid

tick() changes motor/expression state

Slice 2 — Add native take-off v0



Goal:



TakeOff intent produces a believable grounded → airborne transition.



Add:



crouch/load

leg impulse

wing impulse

tail stabilise

lift reserve check

failed launch reason

Slice 3 — Native musculotendon bridge



Goal:



Move the good HTML muscle model into C++/native entity code.



Add:



MuscleUnit

MuscleGraph

MuscleSolver

MuscleActivationFrame

Slice 4 — Wing panel aero v0



Goal:



Replace single lift blob with small per-panel wing model.



Add:



panel normal

relative wind

angle of attack

lift

drag

stall

left/right asymmetry

Slice 5 — Field performance guardrails



Goal:



Make spatial fields scalable before we add more environment truth.



Add:



active chunks

dirty cells

per-field tick rate

cost counters

field debug budget

Clean revised verdict

Update 2026-05-16: native dragon builder bug is fixed in Slice 1.
Update 2026-05-16: native take-off v0 is fixed in Slice 2.
Update 2026-05-16: native musculotendon bridge v0 is fixed in Slice 3.
Update 2026-05-16: native wing panel aero v0 is fixed in Slice 4.
Update 2026-05-16: native field performance guardrails are fixed in Slice 5.



You currently have:



native EFE architecture ✅

LOD strategy ✅

field substrate ✅

surface expression layer ✅

debug visualiser ✅

musculotendon prototype ✅

simplified native flight ✅

native dragon builder v0 ✅

native take-off v0 ✅

native muscle solver v0 ✅

native wing panel aero v0 ✅

field performance guardrails v0 ✅



So yes: we can make this stable and performant, but only if we keep it layered and budgeted.



The sane target is not “simulate nature perfectly”.



The sane target is:



enough physical truth, at the right resolution, around the active creature, producing believable emergent motion without global calculation soup.

