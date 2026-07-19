---
'octane': patch
---

React-hosted islands are now fully typed at the `<OctaneCompat>` boundary, in both authoring forms. `Octane.JSX.Element` extends `Promise<React.ReactNode>` (type-level only), so the exact signature the tsrx tooling infers for a `.tsrx` export is a valid React 19 JSX element type: `<OctaneCompat><Island …/></OctaneCompat>` type-checks zero-cast with exact island prop checking, while octane element values remain rejected in ordinary `ReactNode` positions. A typed `component`/`props` form was added alongside — `<OctaneCompat component={Island} props={{ … }} />` (client and server entries) — accepting the same island transport explicitly, with props inferred from the component's own signature. The `.tsrx` language tooling also pins the DOM renderer's virtual TSX to `@jsxImportSource octane`, so islands type against octane's real JSX even under a React-JSX host tsconfig (mixed React/Octane programs with `tsrx-tsc`).
