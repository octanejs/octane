---
'@octanejs/visx': patch
---

Type visx's SVG props with octane's attribute bag instead of React's.

This package ships raw source and points its exports at it, so a consumer's
TypeScript program compiles every reachable module. React's `SVGProps` is not
assignable to octane's intrinsic element bag — handlers receive native DOM
events, `className` composes clsx-style, `class`/`for` are accepted natively,
and `children` is a renderable — so every component that spread it produced
errors in a consumer's program.

Forty-two modules move from React's `SVGProps` to `Octane.SVGProps`, following
the pattern already established in `grid/`, `group/`, `responsive/`, and
`shape/`. Alongside that: capitalized JSX aliases replace `createElement` where
a React `FunctionComponent | ComponentClass` union reached octane's
`createElement`, which takes a `ComponentBody` and cannot call a constructor; a
real declaration for `d3-interpolate-path`; and a render-prop implementation of
`TooltipPositionContext.Consumer`, which octane deliberately lacks.

Public prop types change accordingly. Handler parameters are now native DOM
events rather than React synthetic events, `className` accepts a `ClassValue`,
and the native `class`, `for`, `hidden`, and `tabindex` spellings are accepted
beside their camelCase counterparts. Component names, prop names, and runtime
behavior are unchanged.

This is partial progress on strict consumer type-checking for visx, not its
completion: the package still reports diagnostics under `tsrx-tsc`, so it keeps
its `SOURCE_PUBLICATION_DEBT` entry and continues to validate through `tsgo`.
