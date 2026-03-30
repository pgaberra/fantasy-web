---
apply: always
---

# Angular Development Guidelines

These guidelines define how code should be written and generated for this Angular project.  
All AI-generated code must follow these conventions.

---

## General Principles

- Use **modern Angular APIs and best practices**.
- Prefer **simple, readable, and maintainable solutions**.
- Follow the **latest Angular recommendations** rather than legacy patterns.
- Try to keep components small and neat for cleaner and more understandable code
- Avoid using legacy patterns such as [ngModel] and (ngModelChange)
- Always make sure that the changes made passes our linting

---

## Dependency Injection
- Services must be injected using inject(). Do not use constructor injection.

## Signals
- Prefer **Angular Signals** for state management.

## Naming conventions
- Prefer using proper names that give a description to the variable. Try to avoid names suchas list, val, value, key...

## Lamba functions
- If a lamba function only has one parameter, avoid the parentheses.

## Types and interfaces
- Never use property existence checks (e.g. `'someKey' in obj`) to discriminate between union types. Always use an explicit discriminant field (e.g. `type: 'skater' | 'goalie'`) to narrow union types safely, as property-based checks can silently break if a type gains that property in the future.

## Comments and documentation
- Don't write any code comments or documentation unless specifically asked to do so.

## Tests
- Unit test classes should use ngMocks for easier dependency injection and mocking in the test classes.
- Prefer using .toEqual over .toBe
- Never use `any` in tests (avoid `{} as any`). Use proper type-safe mocks instead.

## External components and libraries
- If necessary, feel free to import reliable 3rd party components and/or libraries that you think could improve the app.
