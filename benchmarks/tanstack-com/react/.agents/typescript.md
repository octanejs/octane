# TypeScript Conventions

## Avoid Type Casting

Never cast types unless absolutely necessary. This includes:

- Manual generic type parameters (e.g., `<Type>`)
- Type assertions using `as`
- Type assertions using `satisfies`

## Prefer Type Inference

Infer types by going up the logical chain:

1. **Schema validation** as source of truth (Convex, Zod, etc.)
2. **Type inference** from function return types, API responses
3. **Fix at source** (schema, API definition, function signature) rather than casting at point of use

```typescript
// Bad
const result = api.getData() as MyType
const value = getValue<MyType>()

// Good
const result = api.getData() // Type inferred from return type
const value = getValue() // Type inferred from implementation
```

## Generic Type Parameter Naming

All generic type parameters must be prefixed with `T`.

```typescript
// Bad
function withCapability<Args extends unknown[], R>(
  handler: (user: AuthUser, ...args: Args) => R,
) { ... }

// Good
function withCapability<TArgs extends unknown[], TReturn>(
  handler: (user: AuthUser, ...args: TArgs) => TReturn,
) { ... }
```

Common names: `T`, `TArgs`, `TReturn`, `TData`, `TError`, `TKey`, `TValue`
