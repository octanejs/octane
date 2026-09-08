# Type parity assertions

@xyflow/react 12.11.2 ships no type-test suite, so both lanes use repo-authored
probes. The two files assert the same public-surface claims, one against the
published React package with `tsc`, and one against `@octanejs/xyflow` with
`tsrx-tsc`.

The only permitted source difference is the import root:
`@xyflow/react` becomes `@octanejs/xyflow`.

1. `Node` requires an id, numeric position, and data payload.
2. `Edge` requires string source and target ids.
3. `ReactFlowProps` accepts typed nodes, edges, and viewport options while rejecting unknown props.
4. `HandleProps` requires a handle type and position.
5. `OnConnect` receives the public `Connection` shape.
6. `addEdge` preserves the caller's edge subtype.
7. `useNodesState` exposes typed nodes, a setter, and a change callback.
8. `useEdgesState` exposes typed edges, a setter, and a change callback.
9. MiniMap and NodeResizer prop types remain exported from the public package root.
