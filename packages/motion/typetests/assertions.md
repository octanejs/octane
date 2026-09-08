# Type parity assertions

Motion's published package does not ship a reusable type-test suite for the
React surface this binding covers, so both sides of this lane are
port-authored. The two files assert the same public-surface claims, one against
`motion/react@12.42.2` compiled with `tsc`, one against `@octanejs/motion`
compiled with `tsrx-tsc`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `motion/react` → `@octanejs/motion` | the package under test |

Every shared assertion group below appears in both files under the same heading.

1. `motion.div` host factory is accepted.
2. `AnimatePresence` is accepted.
3. `MotionConfig` is accepted.
4. `useMotionValue` returns a readable MotionValue.
5. `useTransform` mapping form is accepted.
6. `useSpring` is accepted.
7. `useAnimate` is accepted.
8. Rejected assertion: number is not a string.
9. Rejected assertion: string is not a number.
