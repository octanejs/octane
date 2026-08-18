# TanStack Pacer type-suite transformations

Upstream `test:types` is `tsc` over the React adapter package source. There are no
dedicated `.test-d.ts` assertion files at the pin.

## Pristine

- Compiler: `tsc`
- Project: `typetests/pristine/tsconfig.json`
- Includes the vendored `@tanstack/react-pacer@0.22.1` source under `upstream/package/src`
- Inventory: `audit/upstream-types.json` (per-file sha256; empty assertion groups)

## Adapted

- Compiler: `tsrx-tsc`
- Project: `typetests/adapted/tsconfig.json`
- Includes the complete Octane adapter source under `src/` only (one-for-one with
  upstream `test:types`)
- Inventory: `audit/adapted-types.json`

## Ordinary Octane-only setter probe

- Compiler: `tsrx-tsc`
- Project: `typetests/octane-only/tsconfig.json`
- `setter-types.test-d.ts` accept/reject evidence for local `Dispatch` /
  `SetStateAction` aliases
- Kept outside required React-parity ownership because it has no pristine React
  assertion counterpart

## Permitted transformations

Documented in `audit/type-parity.json` `permittedTransforms` and enforced by
`scripts/react-parity/tanstack-pacer-types-lib.mjs` via normalized AST/source
comparison of every mapped file:

1. Import roots: `react` → `octane`; `@tanstack/react-store` → `@octanejs/tanstack-store`
2. Provider options import: `../provider/PacerProvider` → `../provider/context`
3. Extension: `provider/PacerProvider.tsx` → `provider/PacerProvider.tsrx`
4. React namespace setter types → local `Dispatch` / `SetStateAction` from `src/internal.ts`
5. Selector slots: `useSelector` → `useSelectorSlot` with `Symbol.for` call-site slots
6. Renderable types in Subscribe signatures: `ReactNode` / `FunctionComponent` → Octane equivalents
7. Provider context helpers extracted to adapted-only `provider/context.ts`
8. Adapted-only modules: `src/internal.ts` and `src/provider/context.ts`

Any other structural change is drift. Controls reject a skipped adapted file, an
unauthorized change outside these transforms, a deleted assertion group, or a
removed `@ts-expect-error`.
