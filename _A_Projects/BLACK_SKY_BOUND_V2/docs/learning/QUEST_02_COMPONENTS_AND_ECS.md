# Quest 02 — Components And ECS Without Panic

## Goal

Understand how BSB stores entity state.

## Concept

In this repo:

```txt
Entity = ID only
Component = data attached to an entity
System = behaviour that reads/writes components
```

## Read these files

1. `src/ecs/world.js`
2. `src/constants/componentTypes.js`
3. `src/components/createComponents.js`
4. `src/game/spawn.js`

## Write these notes

Answer these in your own words:

1. What does `createEntity(...)` return?
2. Where are components stored?
3. What does `getComponent(...)` return when missing?
4. Why are component names centralised in `ComponentType`?
5. Which file attaches components to spawned actors?

## Tiny code task

Do not implement a feature yet.

Add a comment above `Components.statusEffects(...)` explaining what it stores and why it is a component rather than a system-local variable.

Yes, a comment. Calm down. This is learning to read before swinging a hammer.

## Stretch task

Create a note in `learning/quest_notes/quest_02_notes.md` with your answers.

## What you are learning

- `Map`
- `Set`
- object factories
- entity IDs
- why components are data only

## Done when

- you can explain ECS in BSB without saying “component something something”
- tests still pass
