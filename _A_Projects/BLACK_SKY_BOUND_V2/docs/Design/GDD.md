# Game Design Document — Black Sky Bound

## 0. Document Status

**Status:** Living design document  
**Source concept:** `GCD.md`  
**Current build focus:** First playable survival scenario  
**Primary design rule:** Keep the playable version small enough to finish.

This document translates the concept promise from the GCD into build-facing design rules, mechanics, feedback requirements, and implementation notes.

The GCD defines what the game is.  
The GDD defines how the game works.

Sections marked **Undefined**, **Provisional**, or **Needs Test** are intentionally incomplete. Do not fill them with guesses unless a design decision has been tested or agreed.

---

## 1. Game Overview

### Summary

**Black Sky Bound** is a top-down 2D action survival game about a young dragon fighting, fleeing, and surviving its way through a hostile world.

The player is not a hero clearing arenas. The player is a small, frightened, vicious creature trying to escape a collapsing situation involving raiders, husks, fire, predators, and larger forces it cannot yet control.

### Genre / Format

- **Genre:** Top-down 2D action survival
- **Camera / View:** Top-down 2D
- **Mode:** Single-player
- **Session Length:** 10–20 minute levels
- **Target Platform:** PC first

### First Playable Target

A short top-down survival action scenario where a young dragon moves through a dangerous forest, dodges threats, attacks at close range, uses smoke to disrupt enemies, and reaches safety before being overwhelmed.

---

## 2. Core Fantasy

The player should feel like:

> A small but dangerous young dragon, newly alone in a chaotic world, surviving through instinct, speed, smoke, tooth, claw, and sudden bursts of terrifying power.

### Fantasy Pillars

- **Vulnerable, but dangerous**
- **Fast, physical, and animalistic**
- **Surviving, not conquering**
- **Escaping through chaos**
- **Power emerging in bursts, not full control**

### Anti-Fantasy

The player should not feel like:

- a heroic chosen-one dragon
- a cute mascot creature
- a clean arena brawler character
- a strategy-game commander
- a fully powered fantasy monster from the start

---

## 3. Player Experience Pillars

### 3.1 Speed Under Pressure

The player should move quickly through dangerous spaces, using panic movement, dodging, sudden lunges, and terrain reading to survive.

**Status:** Provisional  
**Needs:** Movement tuning, acceleration rules, dodge/lunge feel test.

### 3.2 Tooth, Claw, Body

Combat should begin physical and close-range. The dragon survives through biting, clawing, body lunges, and disruption before fire becomes available later.

**Status:** Provisional  
**Needs:** First melee move set, hit timing, recovery timing, enemy reaction tests.

### 3.3 Smoke and Disruption

Smoke is an early survival tool. It should let the dragon disrupt enemies, break pressure, obscure movement, or create escape windows.

**Status:** Provisional  
**Needs:** Decide whether smoke is cone, cloud, trail, burst, or context-sensitive action.

### 3.4 Escape, Not Arena-Clearing

The goal is survival and escape, not clearing every enemy. The player should often be choosing whether to attack, flee, hide, disrupt, or burst through.

**Status:** Strong design intent  
**Needs:** Scenario objectives that reward escape over full combat cleanup.

---

## 4. First Playable Scope

### Must Include

- One short playable scenario
- Young dragon movement
- Dodging / burst movement
- Close-range attack
- Smoke or disruption ability
- Enemy pressure
- Environmental danger
- Reach-safety objective
- Death and automatic respawn
- Minimal start / pause / settings shell

### Must Not Include Yet

- Full stealth system
- Full flight
- Base building
- Strategy systems
- Morale systems
- Complex fire simulation
- Open-world exploration
- Multiple playable characters
- Long-term survival crafting
- Deep upgrade trees
- Large dialogue system

### Scope Discipline Rule

If a proposed feature does not directly support the first playable survival scenario, park it.

---

## 5. Controls

**Status:** Undefined / Needs input testing

### Current Intent

Controls should feel immediate, physical, and readable. The player should be focused on survival, not command management.

### Candidate Control Needs

| Action | Input | Status | Notes |
|---|---:|---|---|
| Move | TBD | Undefined | WASD or mouse movement to decide. |
| Sprint / Burst | TBD | Undefined | Should feel like panic movement, not a generic run toggle. |
| Dodge / Lunge | TBD | Undefined | May overlap with attack or burst. |
| Bite / Claw | TBD | Undefined | Needs simple, reliable primary attack. |
| Smoke | TBD | Undefined | Could be hold, tap, directional, or escape burst. |
| Pause | Esc | Provisional | Tap to pause/resume; hold or secondary input for system menu. |

### Open Questions

- Is movement keyboard-based, mouse-directed, or hybrid?
- Should attacks aim towards mouse, movement direction, or nearest target?
- Should smoke be a defensive panic button or a deliberate placement tool?

---

## 6. Movement

**Status:** Provisional

### Design Intent

Movement should sell the dragon as a physical young creature: fast, low, dangerous, slightly uncontrolled under pressure.

### Movement Feel Goals

- responsive enough for survival action
- not floaty
- not slow RTS-style movement
- panic-capable without becoming silly
- body weight visible in turns, lunges, stops, and recovery

### Candidate Movement Components

- Base movement
- Short burst / sprint
- Dodge or sidestep
- Body lunge
- Collision slide around terrain
- Brief stumble/flinch on heavy hit

### Implementation Notes

- Movement tuning should be tested before adding more abilities.
- Avoid complex stamina rules until the basic movement loop feels good.
- The first playable only needs enough movement depth to make escape tense and readable.

### Open Questions

- Does the dragon rotate instantly or physically turn?
- Can the player cancel attacks with movement?
- Can burst movement damage or stagger small enemies?

---

## 7. Combat

**Status:** Provisional

### Design Intent

Combat should be close, risky, and animalistic. The player is dangerous, but getting surrounded should be frightening.

### Initial Combat Actions

| Action | Purpose | Status |
|---|---|---|
| Bite | Focused close-range damage | Undefined |
| Claw swipe | Wider short-range pressure | Undefined |
| Body lunge | Movement plus impact | Undefined |
| Smoke disruption | Escape / confuse / interrupt | Provisional |

### Combat Rules

- The player should not be encouraged to clear every enemy.
- Enemy contact should create pressure quickly.
- Attacks should create short survival windows, not safe dominance.
- Hit feedback must be extremely clear.

### Open Questions

- Should bite and claw be separate moves or a single contextual attack chain?
- Should body lunge cost stamina/breath?
- Can the dragon knock enemies into hazards?
- How much damage should enemies take before retreating, dying, or regrouping?

---

## 8. Smoke / Disruption

**Status:** Partially defined

### Design Intent

Smoke should be the dragon’s first strange power: not full fire, not magic spellcasting, but a survival instinct that disrupts enemies and buys space.

### Possible Smoke Uses

- briefly obscure the dragon
- interrupt enemy targeting
- create an escape window
- mark a panic trail
- choke or confuse weaker enemies
- interact with light/fire later

### First Playable Requirement

Smoke only needs one reliable use in the first playable:

> Let the player break pressure long enough to escape or reposition.

### Avoid For Now

- complex gas simulation
- large persistent smoke fields
- multi-material smoke/fire chemistry
- heavy per-pixel simulation

### Open Questions

- Is smoke emitted from the mouth, body, wings, or movement trail?
- Is smoke directional or radial?
- Does smoke cost stamina/breath?
- Do all enemies react to smoke the same way?

---

## 9. Health, Pressure, Death, and Respawn

**Status:** Partially defined

### Design Intent

Health should feel like mounting injury and pressure, not a visible number or pickup economy.

The player should understand danger through screen pressure, audio, movement, and body feedback rather than a traditional health bar.

### Health Model

Health should behave like recoverable pressure:

1. The dragon is hit.
2. Injury pressure increases.
3. Recovery is delayed.
4. If the dragon avoids further damage for long enough, pressure begins to recover.
5. If pressure reaches maximum, the dragon collapses/dies.

### Recovery Rule

**Provisional rule:** Health begins recovering only after the player avoids further damage for a short period.

Suggested starting values for testing:

| Value | Starting Test Range |
|---|---:|
| Recovery delay after hit | 2–4 seconds |
| Full recovery duration | 4–8 seconds |
| Death fade delay | 1.5–2.5 seconds |

These are not final values. Tune through playtesting.

### Health Pickups

Health pickups should be avoided for the first playable. They do not currently fit the grounded survival fantasy.

If healing is ever needed later, prefer diegetic recovery such as:

- reaching shelter
- hiding long enough
- warmth/rest at safe points
- story-specific intervention

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

### Respawn

**Provisional rule:** Respawn is automatic after a short fade-out.

Open decisions:

- checkpoint frequency
- whether enemies reset
- whether world damage persists
- whether death has any scenario consequence

---

## 10. UI & Player Feedback

**Status:** Partially defined

### UI Direction

Black Sky Bound should use minimal, body-led UI rather than conventional HUD elements. The player should read the young dragon’s state through pressure, breath, motion, sound, colour, and screen treatment rather than bars, numbers, or collectible recovery items.

### Core UI Principle

The UI should answer only the player’s immediate survival questions:

- Am I badly hurt?
- Am I exhausted?
- Am I safe enough to recover?
- Am I being overwhelmed?
- Where is escape?
- What action can save me right now?

### Health Feedback

Use:

- red/dark border vignette
- pulse pressure at screen edge
- brief hit distortion
- sound muffling
- heartbeat or breath intensity
- body flinch
- animation weakness near death

Avoid:

- permanent health bar
- floating damage numbers
- healing pickups as default solution
- heavy UI panels

### Stamina / Breath Feedback

Stamina or breath should be communicated indirectly.

Possible feedback:

- heavier breathing
- reduced movement snap
- weakened smoke output
- slight desaturation
- tighter vignette
- lower body posture
- brief screen pressure during overexertion

### Pause Feedback

Pause should be almost symbolic.

Preferred pause presentation:

- simulation freezes
- audio dampens
- image subtly darkens
- one small symbol appears
- no large menu unless requested

Provisional input model:

- Tap Esc: pause/resume
- Hold Esc or secondary input: open system menu

### Required Minimal Menus

Even with minimal in-game UI, the PC release still needs:

- start / continue
- restart checkpoint
- controls
- settings
- quit

These should be understated and stylistically consistent with the world.

### Tutorial / Prompt Rules

Use brief contextual prompts only when needed.

Prompts should:

- appear close to the moment they matter
- fade quickly
- avoid clutter
- teach survival action, not explain lore

### UI Style Notes

Possible surface language:

- ash
- smoke
- moonlight
- bone scratches
- claw marks
- ember glow
- darkened blood/pressure edges
- simple creature-symbols

Avoid:

- clean sci-fi panels
- bright arcade UI
- strategy HUD language
- quest-marker clutter
- MMO-style bars and icons

---

## 11. Enemies

**Status:** Undefined / Needs design pass

### Known Enemy Context

The opening world includes:

- raiders
- husks
- disturbed predators
- environmental fire/chaos
- mother dragon as background catastrophe, not normal enemy

### Enemy Design Intent

Enemies should create pressure, panic, and route problems. They do not all need deep AI in the first playable.

### First Playable Enemy Needs

| Enemy Type | Purpose | Status |
|---|---|---|
| Raider | Armed human pressure / nest attack context | Undefined |
| Husk | Swarming chaotic threat | Undefined |
| Predator | Environmental danger / opportunistic pressure | Undefined |

### Open Questions

- Which enemy appears first?
- Which enemy teaches dodging?
- Which enemy teaches smoke?
- Which enemy is too dangerous to fight directly?
- Do enemies fight each other in the first playable?

---

## 12. Scenario Structure

**Status:** Provisional

### First Scenario Intent

The first scenario should introduce the player as a young dragon separated from safety during a violent collapse.

The player should move through a dangerous forest, survive immediate pressure, and reach safety.

### Candidate Scenario Flow

1. Wake / regain control after nest attack
2. Learn movement under threat
3. Avoid or fight first raiders/husks
4. Use smoke/disruption to break pressure
5. Cross dangerous terrain or burning area
6. Reach cave/shelter/escape point
7. End scenario / unlock next beat

### Objective Style

Objectives should feel environmental, not checklist-heavy.

Prefer:

- visible cave mouth
- moonlit opening
- mother dragon roar/fire direction
- smoke/embers suggesting route
- enemies pushing the player forward

Avoid:

- large waypoint arrows
- quest log clutter
- “Kill 10 raiders” objectives

### Open Questions

- What is the shortest complete first scenario?
- How many enemy types should appear?
- Does the player ever stop moving, or is the level almost entirely escape pressure?
- What is the final safe point?

---

## 13. Visual Direction

**Status:** Strong concept direction / implementation still open

### Reference Words

- dark forest
- ash and smoke
- moonlit chaos
- small creature, huge danger
- violent silhouettes
- glowing eyes and embers

### Avoid

- cute mascot dragon
- bright cartoon fantasy
- clean arenas
- readable-but-boring tiles
- over-detailed realism
- strategy-game visual clutter

### First Playable Visual Priorities

1. The dragon must read clearly.
2. Enemies must read clearly under pressure.
3. Hazards must be understandable quickly.
4. The path to safety must be readable without ugly UI.
5. Darkness should create atmosphere without hiding the game.

### Open Questions

- How stylised should the dragon silhouette be?
- How abstract can terrain be before it loses believability?
- What is the baseline colour palette for forest/night/fire/smoke?
- How much screen treatment is too much during injury or exhaustion?

---

## 14. Audio Direction

**Status:** Undefined

### Design Intent

Audio should communicate body state, threat, and world collapse.

### Possible Audio Pillars

- breath
- heartbeat
- claws/feet on ground
- enemy calls
- distant mother dragon
- forest fire
- husk swarm noise
- muffled panic when injured
- low-pressure silence before danger

### Open Questions

- Does low health create heartbeat or breath dominance?
- Does stamina/breath recovery have an audio cue?
- How much music is present during the first playable?
- Are enemy types identified more by sound than visuals?

---

## 15. Progression

**Status:** Provisional

### Design Intent

Progression should feel like survival instincts awakening, not RPG power inflation.

### Possible Progression Types

- stronger movement options
- new smoke control
- improved lunge / bite / claw timing
- better recovery instincts
- eventual dragonfire
- new scenario access

### First Playable Requirement

The first playable does not need a full progression system.

It only needs one satisfying scenario loop and possibly one end-state unlock tease.

### Open Questions

- Does the first scenario unlock anything?
- When does dragonfire first appear?
- Is progression ability-based, story-based, or both?

---

## 16. Technical Design Notes

**Status:** Provisional / Build-facing notes

### Runtime Priorities

- Keep the first playable lean.
- Avoid heavy simulation unless it directly improves the playable loop.
- Do not rebuild strategy systems from older prototypes unless needed.
- Prefer simple authored scenario logic over broad systemic complexity.
- Prioritise stable framerate and readable feedback.

### Current Technical Bias

- Top-down 2D runtime
- PC first
- Short scenario-based structure
- Minimal HUD
- Automatic respawn
- Event-driven systems where possible
- Avoid “everything on tick” behaviour

### Hard Rule

Do not let engine/tool-building replace finishing the game.

---

## 17. Open Questions / Risks

### Scope Risks

- How do we keep the first playable from expanding back into strategy/simulation work?
- How do we avoid tool-building becoming the project again?
- What is the smallest scenario that still feels complete?

### Feel Risks

- Does movement feel good enough without flight?
- Do tooth, claw, smoke, and movement satisfy before dragonfire exists?
- Can the dragon feel vulnerable and dangerous at the same time?

### Systems Risks

- How much smoke/fire interaction is needed for fun?
- Can health recovery work without feeling too forgiving?
- Can minimal UI stay readable enough for new players?

### Production Risks

- Are we building too many systems before proving the core loop?
- Are we documenting decisions faster than implementing playable truth?
- Is the first playable narrow enough to finish and show?

---

## 18. Decision Log

Use this section to record agreed decisions so we do not re-litigate them every three days like idiots.

| Date | Decision | Reason | Status |
|---|---|---|---|
| TBD | Use GCD for concept promise and GDD for build-facing design. | Prevent concept document bloat. | Agreed |
| TBD | Avoid health pickups in first playable. | Does not fit the grounded survival fantasy. | Agreed/provisional |
| TBD | Use body-led UI instead of permanent HUD bars. | Supports feral survival tone. | Agreed/provisional |
| TBD | Death should fade and auto-respawn without large failure text. | Avoids punitive tone and keeps flow moving. | Agreed/provisional |

---

## 19. Parking Lot

Ideas that may be good later, but are not first playable requirements.

- Full stealth system
- Full flight
- Complex fire spread
- Long-form survival crafting
- Strategy layer
- Morale systems
- Open-world exploration
- Multiple playable dragons
- Advanced enemy faction simulation
- Persistent campaign systems
- Deep upgrade trees

