import { timerSystem } from '../systems/timerSystem.js';
import { inputSystem } from '../systems/inputSystem.js';
import { movementSystem } from '../systems/movementSystem.js';
import { playerFacingSystem } from '../systems/playerFacingSystem.js';
import { combatSystem } from '../systems/combatSystem.js';
import { smokeSystem } from '../systems/smokeSystem.js';
import { enemyPressureSystem } from '../systems/enemyPressureSystem.js';
import { enemyAttackSystem } from '../systems/enemyAttackSystem.js';
import { actorSeparationSystem } from '../systems/actorSeparationSystem.js';
import { healthSystem } from '../systems/healthSystem.js';
import { unitSpawnerSystem } from '../systems/unitSpawnerSystem.js';
import { deathLifecycleSystem } from '../systems/deathLifecycleSystem.js';
import { wyvernProjectionSystem } from '../systems/wyvernProjectionSystem.js';
import { humanoidProjectionSystem } from '../systems/humanoidProjectionSystem.js';
import { predatorProjectionSystem } from '../systems/predatorProjectionSystem.js';
import { wyvernActionImpulseSystem } from '../systems/wyvernActionImpulseSystem.js';
import { proceduralActionSystem } from '../systems/proceduralActionState.js';
import { wyvernAttackContactSystem } from '../systems/wyvernAttackContactSystem.js';
import { impactResponseSystem } from '../systems/impactResponseSystem.js';
import { torchLifecycleSystem } from '../systems/torchLifecycleSystem.js';
import { napalmDripSystem } from '../systems/napalmDripSystem.js';
import { lifetimeSystem } from '../systems/lifetimeSystem.js';
import { scenarioSystem } from '../systems/scenarioSystem.js';
import { viewSyncSystem } from '../systems/viewSyncSystem.js';
import { staminaSystem } from '../systems/staminaSystem.js';
import { dodgeSystem } from '../systems/dodgeSystem.js';
import { worldEventSystem } from '../systems/worldEventSystem.js';
import { pounceCounterSystem } from '../systems/chargeCounterSystem.js';
import { arenaWaveSystem } from '../systems/arenaWaveSystem.js';
import { bodyContactRigSystem } from '../systems/bodyContactRigSystem.js';
import { raiderPhysicalMotionSystem } from '../systems/raiderPhysicalMotionSystem.js';

export const ACTION_SYSTEMS = Object.freeze([
  timerSystem,
  inputSystem,
  playerFacingSystem,
  worldEventSystem,
  staminaSystem,
  movementSystem,
  combatSystem,
  enemyPressureSystem,
  dodgeSystem,
  pounceCounterSystem,
  actorSeparationSystem,
  healthSystem,
  proceduralActionSystem,
  wyvernActionImpulseSystem,
  wyvernProjectionSystem,
  raiderPhysicalMotionSystem,
  humanoidProjectionSystem,
  predatorProjectionSystem,
  bodyContactRigSystem,
  enemyAttackSystem,
  smokeSystem,
  wyvernAttackContactSystem,
  deathLifecycleSystem,
  unitSpawnerSystem,
  arenaWaveSystem,
  impactResponseSystem,
  torchLifecycleSystem,
  napalmDripSystem,
  lifetimeSystem,
  scenarioSystem,
  viewSyncSystem
]);

export const ACTION_SYSTEM_NAMES = Object.freeze(ACTION_SYSTEMS.map((system) => system.name));
