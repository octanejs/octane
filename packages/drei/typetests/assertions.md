# Drei type parity assertions

The pristine and adapted public API files are repository-authored counterparts:
the pristine side compiles against `@react-three/drei@10.7.7` with `tsc`; the
adapted side compiles against `@octanejs/drei` with `tsrx-tsc`.

Only these transformations are permitted:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@react-three/drei` → `@octanejs/drei` | selects the binding under test |
| 2 | leading lane description comment | identifies the compiler and package for each side |

The files retain identical assertion groups:

1. Public exports and accepted prop shapes.
2. Invalid `View` frame count is rejected.
