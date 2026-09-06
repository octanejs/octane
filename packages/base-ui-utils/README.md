# @octanejs/base-ui-utils

Base UI 0.4.0 utilities and stores adapted for Octane. This package supplies the
shared hooks, DOM helpers, and stores used by `@octanejs/base-ui` 1.8.0.

## Installation

```sh
npm install @octanejs/base-ui-utils
pnpm add @octanejs/base-ui-utils
```

Import individual utilities in an Octane application:

```ts
import { useControlled } from '@octanejs/base-ui-utils/useControlled';
import { Store } from '@octanejs/base-ui-utils/store';
```

The package uses Octane hooks and native DOM events. Compile its ES module source
with the application's Octane compiler. React is used only as the test oracle.

The pinned source and verification status are recorded in [UPSTREAM.md](./UPSTREAM.md)
and [status.json](./status.json).

## Development checks

From the repository root:

```sh
pnpm --dir packages/base-ui-utils test          # Native utility contracts
pnpm --dir packages/base-ui-utils test:upstream # Adapted upstream suite
pnpm --dir packages/base-ui-utils test:pristine # Immutable React oracle
pnpm --dir packages/base-ui-utils upstream:verify
```
