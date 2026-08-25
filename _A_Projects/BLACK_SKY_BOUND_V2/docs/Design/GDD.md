# Game Design Document — Black Sky Bound

## 0. Document Status

**Status:** Living design document  
**Source concept:** `GCD.md`  
**Last design refresh:** 2026-08-14  
**Current build focus:** Opening-to-early-game playable path, instinct progression, combat feel, 3D presentation, and production-quality audiovisual feedback.  
**Primary design rule:** Keep the playable version small enough to finish.

This document translates the concept promise from the GCD into build-facing design rules, mechanics, feedback requirements, and implementation notes.

The GCD defines what the game is.  
The GDD defines how the game works.

Sections marked **Undefined**, **Provisional**, **Needs Test**, or **Target** are intentionally incomplete. Do not fill them with guesses unless a design decision has been tested or agreed.

The repository runtime is now substantially ahead of the original first-playable notes. Where implementation and intended design differ, this document should state both clearly rather than treating legacy behaviour as canon.

---

## 1. Game Overview

### Summary

**Black Sky Bound** is an isometric 3D action-survival game about a newly hatched young wyvern fighting, fleeing, learning, and surviving through a hostile night.

The player is not a hero clearing arenas. The player is a small, frightened, vicious creature trying to escape a collapsing situation involving raiders, husks, werewolves, fire, predators, and larger forces it cannot yet control.

The game's power curve should feel biological and experiential. The wyvern does not acquire a conventional spell bar; survival behaviours deepen into increasingly controlled **instincts**.

### Genre / Format

- **Genre:** Isometric 3D action survival
- **Camera / View:** Fixed isometric / elevated top-down 3D
- **Mode:** Single-player
- **Structure:** Compact authored levels / scenes forming one short first game
- **Target Platform:** PC / laptop first
- **Input priority:** Keyboard + mouse first, with a control language that can translate cleanly to controller later

### Current Playable Target

A connected opening and survival path where the player hatches, learns basic movement and evasion, survives escalating enemy pressure, awakens smoke as the first major instinct, and develops towards increasingly controlled breath attacks and eventual napalm.

---

## 2. Core Fantasy

The player should feel like:

> A small but dangerous young wyvern, newly alone in a chaotic world, surviving through instinct, speed, smoke, tooth, and sudden bursts of terrifying emerging power.

### Fantasy Pillars

- **Vulnerable, but dangerous**
- **Fast, physical, and animalistic**
- **Surviving, not conquering**
- **Escaping through chaos**
- **Power emerging through instinct and experience, not a spell menu**
- **A creature becoming more capable without becoming clean, heroic, or fully controlled**

### Anti-Fantasy

The player should not feel like:

- a heroic chosen-one dragon
- a cute mascot creature
- a clean arena brawler character
- a strategy-game commander
- a fully powered fantasy monster from the start
- an MMO character juggling a row of unrelated ability hotkeys

---

## 3. Player Experience Pillars

### 3.1 Speed Under Pressure

The player should move quickly through dangerous spaces, using panic movement, dodging, sudden lunges, and terrain reading to survive.

**Status:** Implemented foundation / Needs feel tuning  
**Needs:** Better grounded crawl/stalk presentation, turning and acceleration polish, dodge feel, enemy collision/pathing improvements.

### 3.2 Tooth and Body

Combat begins physical and close-range. The young wyvern should rely primarily on one convincing bite rather than a broad melee combo assembled from visually weak attacks.

**Design decision:** Retire the base wing/wing/bite combo as the target design. Wings are young, vulnerable locomotion structures rather than routine weapons.

**Target:** One high-quality base bite with strong anticipation, neck/jaw motion, contact, sound, enemy reaction, and recovery.

### 3.3 Smoke and Disruption

Smoke is the first major instinct and the foundation of the wyvern's breath-power progression.

It begins as a broad panic response and gradually becomes directed, compressed, heated, and finally combustible.

**Status:** First awakening implemented; wider progression defined below.

### 3.4 Escape, Not Arena-Clearing

The goal is survival and escape, not clearing every enemy. The player should often be choosing whether to attack, flee, hide, disrupt, or burst through.

**Status:** Strong design intent

---

## 4. Current Scope

### Must Support

- Embodied egg-hatching opening
- Young wyvern ground movement
- Dodge / burst movement
- Dodge-to-leap counter
- One strong close-range bite
- Smoke instinct awakening
- Multiple levels / scene transitions
- Raiders, husks, and werewolf pressure
- Enemy-versus-enemy interactions where appropriate
- Environmental danger, fire, darkness, weather, smoke, and Mama world events
- Body-led health and stamina feedback
- Death and automatic respawn
- Minimal start / pause / settings shell
- Instinct progression towards napalm
- A late-game Mama werewolf confrontation
- A narrative ending that can introduce the werewolf pup without turning the final beat into a reward-screen pet unlock

### Avoid / Park Unless Required

- Full stealth simulation
- Full player flight
- Base building
- Strategy systems
- Morale systems
- Open-world exploration
- Multiple playable characters
- Long-term survival crafting
- Deep RPG upgrade trees
- Large dialogue system
- Complex systemic fire chemistry beyond what supports the authored game

### Scope Discipline Rule

New systems must serve the playable story and survival loop. Tool-building, simulation breadth, and procedural sophistication are not success conditions by themselves.

---

## 5. Controls — Instinctive Input Language

**Status:** Target design agreed 2026-08-14; runtime migration required in places

### Core Principle

Do not assign every ability a separate keyboard key.

The player should learn a very small number of physical verbs, while newly awakened instincts deepen what those verbs can express.

The intended combat language is:

| Input | Physical meaning | Target behaviour |
|---|---|---|
| WASD | Move | Screen-relative ground movement |
| LMB | Jaws / attack | Base bite; contextual offensive follow-ups |
| Space | Evade | Dodge / burst movement |
| RMB | Breath / instinct | Smoke and later breath-power family |
| Shift | Sprint / urgency | Existing runtime behaviour; keep only if it earns its place |
| Esc | Pause | Minimal pause / system access |

### Bite

- **LMB normally:** one strong bite.
- No default wing/wing/bite combo target.
- The attack should aim towards the mouse/pointer direction unless testing proves another solution better.

### Dodge and Leap Counter

- **Space:** dodge.
- During the valid dodge follow-up window, **LMB:** leap/counter attack.
- The first-scene tutorial should teach this through brief slow-time and an input prompt.
- This tutorial behaviour existed before the tutorial migration and needs restoring in the current presentation path.

**Runtime mismatch to resolve:** the current implementation uses a second Space press for `DODGE CHARGE`; canonical target is **Space → LMB**.

### Breath / Instinct

RMB represents the wyvern accessing its breath instinct, not a numbered ability slot.

Target progression:

- **Tap RMB:** broad radial Smoke Veil.
- **Hold RMB:** controlled Smoke Stream / forward cone once unlocked.
- **Hold RMB + tap LMB:** Smouldering Spit once unlocked.
- **Hold RMB + hold LMB, then release:** charged Napalm Spit once unlocked.

The exact thresholds and input buffering require testing, but the control language should remain simple enough to translate later to controller triggers/buttons without redesigning the ability system.

### Input Design Rule

If a new instinct cannot fit naturally into the existing physical verbs, first ask whether it is actually part of the same creature progression before adding another dedicated key.

---

## 6. Movement

**Status:** Implemented foundation / Active feel work

### Design Intent

Movement should sell the wyvern as a physical young creature: fast, low, dangerous, slightly uncontrolled under pressure.

### Movement Feel Goals

- responsive enough for survival action
- not floaty
- low, grounded, and stalk-like when moving normally
- panic-capable without becoming silly
- body weight visible in turns, lunges, stops, and recovery
- wings support body language and locomotion rather than reading as generic melee weapons

### Current / Target Components

- WASD movement
- Sprint / urgency movement, subject to continued usefulness testing
- Space dodge
- Dodge → LMB leap/counter
- Collision slide around terrain
- Brief flinch / pressure response on heavy hit

### Implementation Notes

- Screen-relative movement is already supported in the 3D renderer path.
- Stamina exists and can gate high-cost evasion/counters.
- Inter-enemy collision, crowd movement and leash behaviour need further work; enemies should not look broken merely because they are trying to maintain authored pressure ranges.

---

## 7. Combat

**Status:** Implemented foundation / Target simplification

### Design Intent

Combat should be close, risky, and animalistic. The player is dangerous, but getting surrounded should be frightening.

### Core Combat Actions

| Action | Purpose | Status |
|---|---|---|
| Bite | Reliable close-range damage | Implemented; visual/feel quality still active work |
| Dodge | Avoid pressure / reposition | Implemented |
| Dodge → leap counter | Risk/reward evasive retaliation | Implemented foundation; input should migrate to Space → LMB |
| Smoke Veil | Break pressure / disrupt | Implemented unlock path |
| Later breath instincts | Range, disruption and eventual lethal power | Progression target |

### Combat Rules

- Do not encourage clearing every enemy.
- Enemy contact should create pressure quickly.
- Attacks create short survival windows, not safe dominance.
- Hit feedback must be extremely clear.
- Physics/contact should remain grounded in actual body/contact volumes rather than arbitrary screen-space hits.
- Friendly/enemy faction interactions can create useful chaos, but should remain readable.

### Current Simplification

The existing `BITE_CLAW` / “ATTACK COMBO” naming and presentation should be treated as legacy implementation language. Canonical target is a **single primary bite** unless later testing proves a second physical attack is genuinely needed.

---

## 8. Breath Instincts / Smoke / Fire Progression

**Status:** First unlock implemented; progression plan defined

### Design Intent

Breath powers are one developing biological lineage, not a collection of unrelated spells.

The player should feel the same internal mechanism becoming more controlled and dangerous:

> panic smoke → directed smoke → compressed smouldering spit → ignition → napalm

### Instinct 1 — Smoke Veil

**Unlock:** First major scene transition / awakening.  
**Input:** Tap RMB.  
**Role:** Defensive panic response.

- broad radial burst
- low control
- breaks pressure and creates escape space
- obscures/disrupts enemies
- should not begin unlocked at game start

The current smoke-awakening transition already owns the Mama impact, raider scatter, smoke blackout, EXHALE prompt, repeated player input and radial-smoke release.

### Instinct 2 — Smoke Stream

**Input:** Hold RMB.  
**Role:** Same breath mechanism under increasing conscious control.

- directional forward cone / stream
- narrower than Smoke Veil
- greater useful range
- sustained or drain-based use
- better for shaping approach lanes than panic escape

### Instinct 3 — Smouldering Spit

**Input target:** Hold RMB + tap LMB.  
**Role:** First true projectile-like breath attack.

- compressed smoking glob / spit
- low direct damage
- creates a brief local smoke/disruption effect
- useful for confusion, pressure interruption, and eventually breaking line-of-sight once enemy perception supports it properly
- should feel biologically adjacent to smoke rather than like a magic fireball

### Instinct 4 — Cinder Breath / Ignition

**Status:** Provisional intermediate power.

This is the developmental step between smouldering spit and true napalm.

- short-range hot ash / ember exhalation
- modest direct damage
- strong stagger or panic potential
- can ignite selected environmental materials or interact with existing smoke
- first clear visual appearance of orange/heat inside the wyvern's previously grey-black breath

This unlock should communicate that the wyvern has learned **heat**, but not yet Mama's combustible secretion.

### Instinct 5 — Napalm Spit

**Input target:** Hold RMB + hold LMB to charge; release to fire.  
**Role:** Major late-game offensive payoff.

- proper projectile attack
- combustible / pooling impact behaviour
- materially higher damage and area denial
- strongest visible connection to Mama's fire biology
- should arrive late enough to feel like a genuine transformation in capability

### Design Rule

Practice develops **control and effectiveness**. Story/instinct moments develop **new capability**.

The game should not become a hotbar or spell-wheel game as more instincts unlock.

---

## 9. Health, Pressure, Stamina, Death, and Respawn

**Status:** Implemented foundation / Ongoing tuning

### Design Intent

Health should feel like mounting injury and pressure, not a pickup economy.

The player should understand danger through screen pressure, audio, movement, and body feedback rather than relying on a dominant conventional health HUD.

### Health Model

Health behaves like recoverable pressure:

1. The wyvern is hit.
2. Injury pressure increases.
3. Recovery is delayed.
4. If the player avoids further damage long enough, pressure begins to recover.
5. If pressure reaches maximum, the wyvern collapses/dies.

### Stamina

Stamina already gates demanding movement/combat actions and should continue to support the physicality of dodging and counters.

Do not let stamina become constant bar-watching. Body, breath and screen feedback should carry most of the communication.

### Health Pickups

Avoid routine health pickups. If explicit healing is required later, prefer diegetic recovery such as shelter, rest, warmth, or story-specific intervention.

### Death Handling

Death should be quiet and non-punitive.

Avoid:

- large “YOU DIED” text
- dramatic failure splash screens
- sarcastic or judgemental messaging
- forcing the player through menus after every death

Preferred flow:

1. Player is overwhelmed / killed.
2. Sound drops away.
3. Screen narrows, darkens, or fades through smoke/ash.
4. Brief blackout.
5. Automatic respawn at latest checkpoint.

---

## 10. UI & Player Feedback

**Status:** Implemented foundation / Active presentation work

### UI Direction

Black Sky Bound should use minimal, body-led UI rather than conventional HUD-heavy presentation.

The UI should answer only immediate survival questions:

- Am I badly hurt?
- Am I exhausted?
- Am I safe enough to recover?
- Am I being overwhelmed?
- Where is escape?
- What instinct/action can save me right now?

### Health / Stamina Feedback

Prefer combinations of:

- red/dark border pressure
- pulse pressure at screen edge
- brief hit distortion
- sound muffling
- heartbeat / breath intensity
- body flinch
- posture or movement weakness
- restrained stamina overlay where needed for readability

Avoid floating damage numbers, MMO bars, quest clutter, and healing-item UI loops.

### Tutorial / Prompt Rules

Use brief contextual prompts close to the moment they matter.

Current priority:

- Restore the early dodge-counter teaching beat from before the tutorial migration.
- Use brief slow-time when the first relevant combat threat makes the action necessary.
- Teach **Space → LMB** rather than requiring the player to memorise an abstract “charge” key.
- Smoke awakening should remain diegetic and action-led: the player exhales through the smoke rather than reading a tutorial panel.

### Pause / Menus

Keep pause visually understated, but the PC release still needs start/continue, restart checkpoint, controls, settings, and quit.

---

## 11. Enemies

**Status:** Implemented foundation / Behaviour and presentation tuning active

### Current Enemy Families

| Enemy Type | Purpose | Current direction |
|---|---|---|
| Raider | Armed human pressure; patrols, torches, spears, group behaviour | Procedural 3D bodies and recipe-backed variation implemented |
| Husk | Chaotic/swarming pressure | Existing combat/AI foundation |
| Werewolf | Larger predatory threat; lunge/bite pressure; late-game lineage | Existing predator presence; Mama werewolf is late-game boss target |

### Enemy Design Intent

Enemies should create pressure, panic, and route problems rather than behaving like stationary arena targets.

### Behaviour Notes

- Windup / attack / recovery readability matters more than raw AI cleverness.
- Enemy-versus-enemy and faction interactions may contribute to world chaos.
- Stuck recovery and leash systems exist, but current leash/crowd behaviour can look unnatural.
- Inter-enemy collision and pathfinding need a more coherent solution so groups do not jam, repel strangely, or appear indecisive around the player.
- Smoke should eventually interact with perception/line-of-sight rather than only applying abstract disruption values.

---

## 12. Scenario / Story Structure

**Status:** Developing

### Opening

The game begins with the player embodied inside the egg rather than waking after the attack.

Current opening direction includes:

1. Darkness / shell enclosure and exterior sound perspective
2. Cracking / emergence
3. Baby wyvern first cry from the player actor
4. First movement through the aftermath
5. Early combat pressure and dodge/counter teaching
6. Mama as a powerful off-screen / flyover world presence rather than a controllable ally

### First Major Instinct Transition

At the transition into the next major playable scene:

1. Mama impacts / lands violently off-screen.
2. Camera shake, debris and raider reactions establish the event without requiring a janky full Mama landing animation.
3. Smoke rolls over and blacks out the scene.
4. The player receives the EXHALE prompt.
5. Repeated breath input clears pockets in the smoke.
6. Smoke Veil unlocks as the first major instinct.
7. The next playable space immediately gives the player a reason to use it under pressure.

### Mid-game Development

Progression should introduce increasingly controlled breath instincts in authored situations that prove why each new behaviour matters.

Avoid unlocking abilities in isolation from level design.

### Late-game Story Target

- Mama Wyvern dies before the final Mama werewolf confrontation.
- The young wyvern defeats the adult werewolf.
- Afterwards it discovers the werewolf pup.
- The pup should not be presented primarily as a collectible or reward-screen companion unlock.
- Preferred emotional direction: one newly orphaned creature recognises another; the pup eventually follows.
- The final presentation of Mama's absence/death still needs a deliberate authored beat so the ending feels conclusive rather than simply stopping after the boss.

### Objective Style

Objectives should feel environmental, not checklist-heavy.

Prefer visible spaces, light, smoke, sound, threat movement and authored pressure over waypoint arrows or “kill X enemies” tasks.

---

## 13. Visual Direction

**Status:** 3D runtime established / Art quality active

### Reference Words

- dark forest
- ash and smoke
- moonlit chaos
- small creature, huge danger
- violent silhouettes
- glowing eyes and embers
- faceted, physical forms rather than flat strategy sprites

### Runtime Direction

The default runtime renderer is now Three.js `webgl3d`, using a fixed isometric orthographic camera.

The game world, creatures, terrain, effects, lighting and Mama events are represented through the 3D renderer / screen-space layers as appropriate.

### Lighting Principle

Darkness should create strong contrast and mystery without becoming an opaque blue/black wash.

Light should feel as though it **carves readable space out of darkness**, rather than brightening the whole world or relying on a uniform dark overlay that smears light sources.

### Current Visual Priorities

1. Grounded baby-wyvern movement and pose quality
2. One excellent readable bite/contact action
3. Stronger terrain/tree/cliff material and mesh quality
4. Clean object/contact shadows without chunky square bases
5. Production-quality smoke/napalm/fire effects
6. Stable performance while preserving lighting contrast

---

## 14. Audio Direction

**Status:** Production foundation established / Expanding

### Design Intent

Audio communicates body state, threat, scale, enclosure, and world collapse.

### Current Foundations

- Transform-owned spatial audio exists in the runtime.
- Opening audio perspective changes with the egg enclosure.
- The hatchling has a dedicated real-source first cry rather than borrowing Mama's roar.
- The baby bite has moved towards a real-source production palette.
- Mama/world threat audio is being treated as spatial world-event sound rather than generic centred cues.

### Audio Pillars

- breath and throat/body texture
- claws/feet and body movement
- readable enemy attacks/calls
- Mama scale and distance
- fire / napalm / smoke pressure
- exterior world sound filtered by enclosure or obstruction
- low-pressure silence before danger

Avoid generic fantasy-dragon sound when specific reptilian, crocodilian, alligator-like, strained or animal recordings can create a more believable identity.

---

## 15. Instinct Progression & Mastery

**Status:** Core progression philosophy agreed; implementation beyond first unlock TBD

### Design Intent

Progression should feel like survival instincts awakening and being practised, not RPG power inflation.

### Capability Progression

Current target order:

1. **Movement + Bite** — baseline newborn physical survival
2. **Dodge + Leap Counter** — accessible within the first scene
3. **Smoke Veil** — first major awakened power; broad radial panic response
4. **Smoke Stream** — directed, sustained control
5. **Smouldering Spit** — first projectile-like compressed breath attack
6. **Cinder Breath / Ignition** — provisional intermediate heat milestone
7. **Napalm Spit** — late-game major offensive instinct
8. **Werewolf pup relationship** — narrative/passive-ish future companion potential, not a conventional combat skill unlock

### Instinct Mastery

Each breath instinct should expose enough data to grow through use and tuning.

Candidate mastery variables:

**Smoke Veil**
- radius
- density / disruption strength
- persistence
- stamina/breath cost

**Smoke Stream**
- range
- cone width
- density / pressure effect
- sustained cost

**Smouldering Spit**
- projectile velocity
- accuracy / spread
- impact smoke size
- stagger / panic
- damage

**Cinder Breath**
- heat
- cone range
- stagger
- ignition effectiveness

**Napalm Spit**
- charge rate
- projectile size / velocity
- pool size
- burn duration
- damage

### XP / Growth Rule

- Usage may award instinct-specific mastery XP.
- Use diminishing returns or other anti-grind rules so the player is not encouraged to spam an ability into a wall.
- Practice improves effectiveness/control within a capability.
- Story/instinct moments unlock new capabilities.
- Base and growth values must be data-driven/exposed enough for tuning rather than buried across implementation code.

### Progression Anti-Goal

Do not build a deep upgrade-tree UI for the first game. Growth should be felt primarily through the creature and its abilities.

---

## 16. Technical Design Notes

**Status:** Current runtime substantially established

### Runtime Direction

- Three.js `webgl3d` is the default renderer.
- Fixed isometric orthographic camera.
- ECS / fixed-step simulation remains authoritative for transforms, poses, collision, contact, damage and progression.
- Renderer-neutral projection feeds the 3D presentation.
- Procedural 3D creature/environment surfaces can vary presentation without moving gameplay truth into the renderer.
- Body/contact rigs own stable hurt/attack shapes.
- Event-driven systems are preferred where possible.
- Avoid “everything on tick” behaviour.
- Maintain explicit performance budgets and fail-visible diagnostics rather than silently degrading important visuals.

### Current Systems Already Beyond the Old GDD

- 3D isometric renderer and camera
- embodied hatching sequence
- smoke awakening transition
- health / stamina feedback and automatic death lifecycle
- multiple enemy attack/state systems
- werewolf predator presence
- Mama flyover / fire world events
- procedural 3D wyvern and raider presentation
- spatial audio and opening enclosure perspective
- authored map/runtime transition pipeline

### Hard Rule

Do not let engine/tool-building replace finishing the game.

---

## 17. Open Questions / Risks

### Feel Risks

- Can the grounded crawl/stalk motion become convincing enough without full flight?
- Can one excellent bite carry the baseline melee better than a broader but weaker combo? **Current answer: likely yes; test it.**
- Can dodge → LMB counter remain obvious and satisfying under pressure?
- Can later breath inputs remain readable without accidental tap/hold ambiguity?

### Enemy / Navigation Risks

- Inter-enemy collision currently contributes to unnatural crowd behaviour.
- Leashing can create visibly strange retreats/re-engagement.
- Smoke needs a more meaningful future perception / line-of-sight relationship.
- Group pressure must remain dangerous without turning into collision soup.

### Visual / Performance Risks

- Lighting must preserve strong light/dark contrast without smearing or hiding gameplay.
- Tree/environment meshes and materials still need a meaningful quality pass.
- Creature animation improvements must be validated visually, not only structurally or through unit tests.
- VFX ambition must remain within stable frame budgets.

### Scope / Production Risks

- Do not build five separate ability systems where one instinct family will do.
- Do not let Axiom/pipeline/tool work become the product.
- Keep design truth, runtime truth and experimental prototypes clearly separated.
- Finish authored playable scenes around the systems that already exist.

### Ending Question

The emotional shape is promising, but the exact final beat remains open: how do we make Mama's death, the werewolf boss defeat, and the pup following the wyvern resolve into a genuinely final-feeling ending rather than a companion teaser?

---

## 18. Decision Log

Use this section to record agreed decisions so we do not re-litigate them every three days like idiots.

| Date | Decision | Reason | Status |
|---|---|---|---|
| TBD | Use GCD for concept promise and GDD for build-facing design. | Prevent concept document bloat. | Agreed |
| TBD | Avoid routine health pickups. | Does not fit the grounded survival fantasy. | Agreed/provisional |
| TBD | Use body-led UI instead of permanent HUD-heavy presentation. | Supports feral survival tone. | Agreed/provisional |
| TBD | Death should fade and auto-respawn without large failure text. | Avoids punitive tone and keeps flow moving. | Agreed/provisional |
| 2026-07-30 | Three.js isometric `webgl3d` becomes the default runtime renderer. | The project has migrated from the old 2D presentation to an embodied 3D world while retaining gameplay simulation authority. | Implemented |
| 2026-08-14 | Treat player powers as **instincts** expressed through a small physical input language. | Avoid hotkey bloat and make progression feel biological/intuitive. | Agreed |
| 2026-08-14 | Baseline melee target is one strong bite; retire wing/wing/bite as the canonical combo. | Wings read as vulnerable locomotion structures and the combo is not landing visually. | Agreed / implementation cleanup needed |
| 2026-08-14 | Canonical dodge counter input is **Space → LMB**. | Reuses the existing evade + attack verbs and feels more instinctive than a second dodge press. | Agreed / runtime migration needed |
| 2026-08-14 | RMB owns the breath-instinct family: tap Smoke Veil, hold Smoke Stream, chord with LMB for later spit/napalm behaviours. | Scales progression without adding a row of ability keys. | Agreed / needs input prototyping |
| 2026-08-14 | Breath progression target is Smoke Veil → Smoke Stream → Smouldering Spit → Cinder/Ignition → Napalm. | Creates one coherent biological development path from panic smoke to Mama-like fire. | Agreed, Cinder remains provisional |
| 2026-08-14 | Practice can improve instinct mastery; story moments unlock new capabilities. | Supports growth without grind-driven RPG progression. | Agreed / system TBD |
| 2026-08-14 | Werewolf pup should land as an emotional/narrative ending beat first, not a reward-screen pet unlock. | Mirrors the newly orphaned wyvern and gives the ending thematic meaning. | Direction agreed; final staging TBD |

---

## 19. Parking Lot

Ideas that may be good later, but are not current first-game requirements.

- Full stealth system
- Full player flight
- Complex systemic fire spread
- Long-form survival crafting
- Strategy layer
- Morale systems
- Open-world exploration
- Multiple playable dragons
- Advanced enemy faction simulation
- Persistent campaign systems
- Deep upgrade trees
- Full companion command / progression system for the werewolf pup
