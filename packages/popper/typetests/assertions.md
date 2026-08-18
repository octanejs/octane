# Type parity assertions

Pinned `react-popper@2.3.0` ships two typings programs under
`upstream/tag/typings/tests/`. The adapted counterparts under `typetests/` must
stay structurally one-for-one after the permitted transformations below.

| # | Transformation | Why |
| --- | --- | --- |
| 1 | formatting | TypeScript printer output must remain structurally identical |
| 2 | import-root | `../..` → `@octanejs/popper` |
| 3 | react-runtime-import | `import * as React from 'react'` / `React.useState` → `import { useState } from 'octane'` / `useState` |
| 4 | jsx-pragma | optional `/** @jsxImportSource octane */` (stripped before structural compare) |
| 5 | negative-control | deleting a real JSX/typed-usage probe or excluding a paired file via tsconfig must fail closed |

`typetests/public-api.test.ts` is Octane-only public-surface evidence checked by the
package `typecheck` script (`typetests/tsconfig.public-api.json`); it has no
upstream twin and is not part of the one-for-one structural pair or the
`popper-adapted-types` react-parity lane.

Shared programs:

1. `main-test.tsx` — Manager/Reference/Popper children props and `usePopper` hook usage.
2. `svg-test.tsx` — Reference under SVG (`<g ref={ref} />`) plus Popper children props.
