---
'octane': patch
---

Keep the transition and hidden-Activity graphs out of applications that only
use Suspense.

A `@try` boundary with a `@pending` arm installed the whole transition driver
and the hidden-`<Activity>` re-render, so every Suspense application shipped
transition attempts, root holds, held-update replay and Activity re-hiding even
when it never called `startTransition` or rendered `<Activity>`. Suspense now
installs only the off-screen swap it uses for urgent branch replacement.
`startTransition` installs the transition members, and `<Activity>` installs its
own re-render when it first hides. Behavior is unchanged.

A server-rendered frame that hydrates native signal reads, a keyed list, a
`@try` boundary, a portal and a behavior island drops 9.6 KB raw and 2.6 KB gzip
of production JavaScript, and a Suspense application without transitions drops
9.7 KB raw and 2.7 KB gzip.
