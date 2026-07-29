---
'@octanejs/shadcn': patch
---

Add the React Aria base, and distribute per component family instead of through
one barrel.

**Breaking:** the `@octanejs/shadcn` root entry is gone. Import the family you
need — `import { Button } from '@octanejs/shadcn/Button'` — or install through
the registry, which is unchanged and remains the primary distribution. The
barrel pulled every family, and transitively every primitive of every base, into
a consumer bundle to use one component. `cn` moves to `@octanejs/shadcn/cn`,
shared types to `@octanejs/shadcn/types`, and `useIsMobile` to
`@octanejs/shadcn/hooks/use-mobile`.

Component sources move under `src/bases/<base>/ui/`, matching upstream's layout.
Emitted registry output is byte-identical, so nothing installed via the shadcn
CLI is affected.

**New:** 33 families of the React Aria base, over `@octanejs/aria/components`,
addressed as `@octanejs/shadcn/react-aria/<Family>`. Sources are upstream's
`aria-nova` style and are class-string identical to it. `select` and `sonner`
are not ported yet (they need `input-group` and `next-themes`); `hover-card`,
`menubar`, and `navigation-menu` do not exist in upstream's aria base at all.

Known limitation: the families whose children are a stateful render prop —
`checkbox`, `switch`, `radio-group`, `breadcrumb` — do not re-render that child
when selection changes, so the tick, thumb, and dot stay in their initial state.
The cause is octane's handling of a call-returned closure in a children
position, not these sources.
