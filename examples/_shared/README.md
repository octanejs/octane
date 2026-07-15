# Shared example infrastructure

`e2e/` contains dependency-free browser and server helpers used by application
examples. Keep shared infrastructure here, but keep product fixtures and journeys
inside the application that owns their behavior.

Every application directly under `examples/` has an `example.json` conforming to
[`../example.schema.json`](../example.schema.json). The manifest names its build,
typecheck, and E2E package scripts; records render modes, bindings, and Octane
features; and links each user journey to its Playwright spec.

Regenerate the machine-readable catalog after changing a manifest:

```sh
node scripts/examples-catalog.mjs
node scripts/examples-catalog.mjs --check
```

The catalog is deterministic and contains no timestamp, so unchanged inputs do
not create noisy diffs. Validation also checks that manifest IDs match directory
names, commands exist in `package.json`, bindings are declared dependencies, and
journey spec paths exist without escaping their example.

Typecheck the dependency-free helpers with:

```sh
pnpm exec tsc -p examples/_shared/tsconfig.json
pnpm examples:shared:test
```
