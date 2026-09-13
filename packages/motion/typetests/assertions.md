# Type parity assertions

Motion's published package does not ship a reusable type-test suite for the
React surface this binding covers, so both sides of this lane are
port-authored. The two files assert the same public-surface claims, one against
`motion/react@13.2.0` compiled with `tsc`, one against `@octanejs/motion`
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

The negative probes consume MotionValue getters, so they fail when binding types are erased. Separate strict generated contracts check every native entry export and every pinned Framer export. The neutral DOM and React hook declarations are authenticated separately; native component calling conventions are witnessed by the complete previous source receipt.

Five immutable registrations from the two upstream `types.test.tsx` files have paired `upstream-registrations.ts` groups. They check Point, MotionValue, target and transition contracts; these type observations do not replace the original runtime assertions.
