---
name: clean-architecture-and-workflow
description: Enforces strict clean code principles, aggressive modularity, and disciplined workflow adherence. Use this skill when writing business logic, refactoring, building React components, or executing step-by-step development plans. Prevents AI code bloat, redundant variables, monolithic files, and premature Linear or Asana ticket closure.
license: Complete terms in LICENSE.txt
---

This skill guides the creation of highly maintainable, modular, and extremely clean code while enforcing a strict step-by-step workflow. It prevents "AI code bloat", such as redundant variable aliasing and monolithic files, and ensures the AI acts as a disciplined pair programmer.

## Operating Rule

Produce the absolute minimum amount of code required to achieve the requested task robustly. Elegance comes from deletion and precision, not from writing more lines. Treat every variable declaration, abstraction, and file addition as a cost.

## 1. Strict Workflow & Process Discipline

Before writing any code, understand the current state of the project:

- **Context First**: Always review the provided migration plan, roadmap, current step, relevant tickets, recent progress, and existing code before acting. Never guess missing context.
- **One Step at a Time**: Execute only the immediate task requested. Do not implement future roadmap items, invent adjacent features, or over-engineer beyond the current scope.
- **Pause for Human Review**: When the task is complete, stop. State exactly what changed, what was verified, and ask for human review before continuing.
- **Ticket Management**: Never assume a task is complete enough to close. Wait for explicit user confirmation before suggesting, acknowledging, or performing closure of Linear or Asana issues.
- **Plan Discipline**: If a plan exists, follow its current step exactly. If the next step is unclear, ask before editing.

## 2. Clean Code & Logic Precision

Write code that is concise, direct, and free of unnecessary indirection:

- **Zero Redundant Aliasing**: Never create variables just to hold another variable's exact value. For example, do not write `const singleStoreSlug = businessSlug;`. Use the existing variable directly.
- **Direct Evaluation**: Avoid wrapping simple boolean checks in verbose helper variables, nested conditionals, or unnecessary functions. Inline simple checks when it improves clarity.
- **Fail Fast & Early Returns**: Handle invalid states, loading states, errors, and empty data at the top of a function or component. Reduce nesting aggressively.
- **Descriptive Naming**: Name values by domain meaning and behavior, not by type alone. Prefer `activeSubscription` over `data` and `canEditInvoice` over `flag`.
- **No Decorative Abstractions**: Extract only when it removes meaningful duplication, isolates a responsibility, or matches an existing project pattern.

## 3. Architecture & Aggressive Modularity

Build for scale and reuse without inflating the solution:

- **Extract Constants**: Do not leave hardcoded configuration strings, repeated labels, route fragments, limits, or magic numbers inline. Move them to module-specific constants, `utils/`, configuration files, or existing project convention locations.
- **File Size Restraint**: Avoid large files and mixed responsibilities. Extract custom hooks, helper functions, constants, and small sub-components before a file becomes difficult to scan.
- **Reusable Components First**: Build UI elements and logical wrappers as reusable pieces. Avoid hardcoding page-specific assumptions into generic components.
- **Business Logic Isolation**: Keep business rules out of presentation code when they can live in domain helpers, hooks, services, or use cases that match the codebase architecture.
- **Dependency Discipline**: Use existing project utilities and patterns before adding new dependencies or abstractions.

## 4. React Implementation Standards

When building React code:

- Use functional React components and Hooks.
- Keep components focused on rendering and user interaction.
- Extract stateful flows into custom hooks when the logic is reused, lengthy, or distracts from the JSX.
- Derive state instead of duplicating it when possible.
- Avoid redundant `useMemo`, `useCallback`, or local state unless there is a clear correctness or performance reason.
- Prefer composition over prop-heavy monoliths.

## 5. Review Checklist

Before finishing, verify:

- The change implements only the requested step.
- No redundant aliases, dead variables, unused helpers, or decorative abstractions were introduced.
- Constants and magic values are extracted according to local project conventions.
- Files remain focused and modular.
- Existing patterns were followed.
- Relevant tests, type checks, lint checks, or manual verification were run when practical.
- No Linear or Asana issue is closed or marked complete without explicit user confirmation.

## Completion Response

When done, respond with:

- What changed.
- What was verified.
- Any remaining risk or manual review needed.
- A clear pause for human review before proceeding.
