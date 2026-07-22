---
name: ai-pipeline-design
description: Design and implement AI Pipeline user interfaces, dashboards, tools, panels, overlays, visual systems, and UX flows with a quiet, beautiful, modular, scalable style. Use when Codex works on UI, frontend polish, design systems, debug surfaces, layout, interaction design, visual QA, or any user-facing AI Pipeline experience that should be subtle, smooth, contextual, concise, and definitely not maximalist.
---

# AI Pipeline Design

Use this skill to make AI Pipeline interfaces feel calm, capable, and alive without visual clutter.

## Design Character

- Prefer quiet confidence over spectacle.
- Keep the first view immediately useful; do not build marketing-style landing pages for tools.
- Make the default state sparse, readable, and elegant.
- Reveal extra detail only when it helps the current task.
- Use progressive disclosure: compact controls, hover/focus states, expandable panels, drawers, popovers, command menus, and context menus.
- Keep debug information highly available but visually optional.
- Avoid maximalist styling, visual noise, gratuitous glow, dense decoration, and one-note palettes.
- Treat motion as feedback and orientation, not decoration.

## Product Principles

- Put the user's active work at the center.
- Design for repeated use, scanning, comparison, and fast recovery from mistakes.
- Make system state legible: loading, empty, partial, degraded, error, and success states should all be intentional.
- Keep primary actions obvious and secondary actions nearby but subdued.
- Give debugging a dedicated mode, drawer, overlay, or inspector rather than mixing it into the normal surface.
- Preserve existing app conventions unless a change clearly improves clarity, modularity, or long-term maintainability.

## Visual System

- Use restrained contrast, careful spacing, and consistent rhythm.
- Keep cards rare: use them for repeated items, modals, inspectors, and genuinely framed tools.
- Prefer full-width or unframed sections for major surfaces.
- Use 8px radius or less unless the local design system already differs.
- Use icons for tool actions when a familiar icon exists; pair with tooltips where meaning is not immediate.
- Keep typography crisp and proportional to context: compact panels need compact headings.
- Avoid oversized hero text inside dashboards, sidebars, cards, and operational tools.
- Do not scale font size directly with viewport width.
- Keep letter spacing at `0` unless matching an established local token.

## Interaction Pattern

- Make contextual menus keyboard and pointer friendly where practical.
- Prefer one clear primary path with optional advanced controls.
- Use hidden-but-discoverable controls for advanced tasks: disclosure buttons, inspector toggles, command palettes, hover toolbars, and `Debug` switches.
- Persist user preferences when the repo already has a persistence pattern.
- Make transitions short, smooth, and interruptible.
- Ensure focus rings, keyboard order, and reduced-motion behavior are respected.

## Modularity And Scalability

- Build small composable components with explicit props and stable layout contracts.
- Separate visual tokens, layout primitives, data adapters, and workflow-specific UI.
- Keep debug UI isolated behind a mode, prop, feature flag, route, or panel.
- Avoid one-off style patches when a token, utility, or component variant is the cleaner local pattern.
- Name components for their product role, not their appearance, unless they are true primitives.
- Keep state ownership obvious; do not bury workflow state in styling components.

## Implementation Workflow

1. Inspect the existing UI structure, style tokens, component patterns, and test expectations.
2. Identify the primary user workflow and the optional diagnostic/debug workflow.
3. Sketch the information hierarchy in code comments or notes only if needed.
4. Implement the smallest cohesive design slice that improves the actual surface.
5. Add or adjust component states for loading, empty, error, active, expanded, and debug-visible modes when relevant.
6. Verify the design at desktop and narrow mobile widths when the surface is browser-rendered.
7. Run the repo's required UI tests for touched areas.

## Completion Checklist

- Default UI is calm, clear, and not crowded.
- Advanced/debug detail is one action away, not always visible.
- Layout remains stable when labels, counters, menus, and errors appear.
- Components are reusable or locally consistent with existing primitives.
- Visual hierarchy guides the eye without relying on heavy decoration.
- Motion improves orientation and does not block fast use.
- Text fits its containers at expected viewport sizes.
- The implementation keeps debug visibility high without making normal use feel technical.
