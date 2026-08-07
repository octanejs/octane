# Type parity assertions

@vis.gl/react-mapbox 8.1.2 ships no type-test suite, so both sides of this
lane are port-authored. The two files assert the SAME public-surface claims,
one against the published upstream binding compiled with `tsc`, one against
`@octanejs/react-map-gl` compiled with `tsrx-tsc`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@vis.gl/react-mapbox` → `@octanejs/react-map-gl` | the package under test |
| 2 | `React.CSSProperties` → the binding's own `style` prop type | Octane has no React types |
| 3 | ref typing via `forwardRef`'s `Ref<T>` → the component's own `ref` prop | Octane has no forwardRef; refs are props |

Every assertion group below appears in both files under the same heading.

1. `Map` accepts view-state props and a container style.
2. `Map` rejects an unknown prop.
3. `Marker` requires `longitude` and `latitude`.
4. `Marker` rejects a string where a number coordinate is required.
5. `Source` requires a discriminated `type`.
6. `Layer` accepts an omitted `id`.
7. `useControl` returns the created control's type.
8. `useMap` returns a collection indexed by id.
