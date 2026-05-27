\# AXIOM Skill — Architectural Integrity \& Maintainability



\## Skill ID

`axiom.architecture.integrity.v1`



\## Purpose

This skill enforces maintainable, scalable, and robust software architecture across AXIOM systems, plugins, runtime capabilities, editor tooling, and generated code.



The goal is not abstract “clean code”.

The goal is:

\- controlled complexity

\- stable extension

\- reduced regression risk

\- governable evolution

\- readable systems under pressure



This skill should influence:

\- planning

\- code generation

\- refactoring

\- review

\- hotfixes

\- plugin architecture

\- runtime capability design

\- UI system decomposition

\- agent/tool orchestration



\---



\# Core Architectural Principles



\---



\# 1. SOLID Principles



\## Single Responsibility Principle (SRP)



\### Rule

A module, class, component, or system should have one clear reason to change.



\### Apply By

\- separating rendering from logic

\- separating orchestration from execution

\- separating UI from persistence

\- separating diagnostics from mutation

\- separating canonical truth from projections



\### Avoid

\- giant god classes

\- mixed authority surfaces

\- UI components performing persistence

\- tools handling unrelated responsibilities



\### AXIOM Examples

Good:

\- `CodeHotfixSurface`

\- `TruthKernelProjection`

\- `SafeWriteService`



Bad:

\- one file handling:

&#x20; - rendering

&#x20; - persistence

&#x20; - routing

&#x20; - mutation

&#x20; - diagnostics

&#x20; - chat orchestration



\---



\## Open / Closed Principle (OCP)



\### Rule

Systems should be open for extension but closed for modification.



\### Apply By

\- adding capabilities

\- registering strategies

\- adding plugins

\- extending handlers through contracts

\- composing runtime behaviours



\### Avoid

\- editing core switch statements repeatedly

\- hardcoding capability branches

\- modifying stable logic for every new feature



\### Preferred Mechanisms

\- strategy registration

\- capability registries

\- plugin manifests

\- event-driven extension

\- semantic routing



\---



\## Liskov Substitution Principle (LSP)



\### Rule

Subtypes must safely replace their parent contracts without breaking behaviour.



\### Apply By

\- preserving expected interfaces

\- maintaining behavioural guarantees

\- ensuring plugin compatibility

\- respecting runtime contracts



\### Avoid

\- partial implementations

\- hidden behavioural changes

\- plugins that silently violate contracts



\### AXIOM Guidance

A capability implementing:

```txt

SafeWriteContract
must always:



validate

return receipts

surface failures

preserve apply semantics

Interface Segregation Principle (ISP)

Rule



Prefer small, focused interfaces over large generic interfaces.



Apply By

splitting tool contracts

separating read/write operations

narrowing runtime APIs

creating specialised capability interfaces

Avoid

giant “manager” interfaces

mega-tool contracts

universal editor APIs

Good Example

IHotfixApply

IHotfixValidate

IHotfixPreview



instead of:



IUniversalEditorSystem

Dependency Inversion Principle (DIP)

Rule



Depend on abstractions, not concrete implementations.



Apply By

routing through contracts

using capability interfaces

abstracting model providers

abstracting persistence seams

Avoid

direct hardcoded dependencies

UI-bound business logic

direct runtime coupling

AXIOM Examples



Prefer:



SafeWriteContract



over:



DirectFilesystemMutation



Prefer:



ModelProviderInterface



over:



HardcodedOllamaCalls

2\. DRY — Don't Repeat Yourself

Rule



Shared logic should exist in one authoritative location.



Apply By

helper utilities

reusable services

shared validators

centralised routing

canonical truth seams

Avoid

duplicated mutation logic

repeated validation code

copied routing heuristics

duplicated MCP connection logic

Important Warning



Do NOT over-abstract prematurely.



Bad abstraction creates:



hidden coupling

unreadable systems

fragile indirection

false reuse



DRY does NOT mean:



“everything must become one giant utility blob”



3\. Preferred Design Patterns

Factory Pattern

Use For

runtime capability creation

plugin instantiation

model provider selection

tool adapter creation

Benefits

controlled object construction

extension without core modification

runtime flexibility

Strategy Pattern

Use For

semantic routing

planner selection

validation modes

rendering modes

apply policies

Benefits

supports OCP

avoids giant conditionals

enables runtime behavioural variation

Repository Pattern

Use For

canonical truth access

persistence abstraction

state storage

historical retrieval

Benefits

isolates storage concerns

simplifies testing

stabilises persistence seams

Observer Pattern

Use For

event systems

live QA updates

runtime notifications

truth kernel updates

hot reload signalling

Benefits

loose coupling

reactive architecture

scalable runtime communication

4\. Complementary Principles

KISS — Keep It Simple

Rule



Prefer the simplest architecture that honestly solves the problem.



Avoid

speculative complexity

unnecessary orchestration

fake abstraction depth

“AI magic” hiding simple logic

AXIOM Guidance



Simple systems with honest seams are preferable to:



over-engineered autonomous theatre

YAGNI — You Aren't Gonna Need It

Rule



Do not build speculative systems before a real seam exists.



Avoid

future-proofing everything

imaginary scalability work

unused abstraction layers

premature optimisation

Guidance



Build:



the next real seam

not the entire imagined universe

Composition Over Inheritance

Rule



Prefer assembling systems from modular behaviours instead of rigid inheritance trees.



Apply By

composing runtime capabilities

modular UI systems

service injection

layered behaviour systems

Avoid

deep inheritance hierarchies

brittle parent-child chains

monolithic base classes

Best Practices Summary

Architectural Goals



Maintain:



high cohesion

low coupling

explicit authority

governed mutation

readable flow

bounded responsibility

System Design Guidance



Systems should:



expose provenance

preserve contracts

validate mutations

separate truth from projections

distinguish evidence from authority

Avoid

hidden side effects

silent mutation

duplicated authority

ambiguous ownership

over-centralised god systems

AXIOM Enforcement Guidance



When generating or reviewing code:



Prefer

modular systems

explicit contracts

capability routing

narrow interfaces

composable services

deterministic validation

receipt-driven mutation

Reject

giant monolith files

duplicated business logic

direct unsafe mutation

hidden coupling

runtime ambiguity

mixed authority surfaces

Architectural Philosophy



AXIOM systems should evolve like governed infrastructure:



observable

extensible

diagnosable

repairable

composable



Not:



magical

opaque

fragile

tightly coupled

impossible to reason about

Final Principle



Good architecture is not:



maximum abstraction



Good architecture is:



clear responsibility, controlled extension, and honest system behaviour under change.

