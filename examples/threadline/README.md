# Threadline

Threadline is a product-shaped social timeline built entirely with Octane TSRX.
Its module-level store uses the real `@octanejs/zustand` binding, so route changes,
timeline prepends, optimistic mutations, connection state, and retry state all
cross the same external-store boundary a consumer application would use.

The data and request timings are deterministic and local. A page reload restores
the published seed rather than depending on a network service, making every
browser journey reproducible in CI.

## Product journeys

- `/` is the home timeline and composer. Publishing prepends an optimistic post;
  `Ctrl/Command + Enter` submits without leaving the editor.
- `Alt + R` while the composer is focused receives Lena's live update. The keyed
  feed preserves existing post nodes, the draft value, and focus.
- `/saved` shows the posts bookmarked in the shared Zustand store.
- `/profile/maya` is a populated deep-linked profile; `/profile/rowan` exercises
  the intentional empty state. Profile follow controls update deterministically;
  reply totals are deliberately read-only until a conversation route exists.
- **Work offline** makes optimistic posts and likes fail after their normal delay.
  They visibly roll back and each failed mutation keeps its own identifiable
  retry after **Reconnect**, even when several posts or reactions fail together.
  A newer reaction supersedes its stale failed intent instead of leaving a Retry
  that could reverse the newer result.
- `/?fault=initial-load` deterministically fails the first timeline load, then
  succeeds through the visible **Try again** action. A post submitted before that
  first response is never clobbered: it remains ahead of the merged seed.

The shell collapses to a compact rail at tablet widths and a sticky header plus
bottom navigation on phones. Connection controls remain available in every
layout, and collapsed navigation retains its accessible link names. Critical
controls are native links, buttons, and a labeled textarea, with visible focus
styles, a skip link, reduced-motion support, and keyboard-complete publishing and
refresh paths.

## Executable evidence

`e2e/threadline.spec.ts` runs five journeys against the production Vite build:

1. mobile deep links, follow state, network controls, saved posts, and the empty
   Rowan profile;
2. a live keyed prepend that retains the exact survivor DOM node, focused
   textarea, and draft before an optimistic keyboard publish;
3. concurrent post rollbacks with identifiable retries, two concurrent like
   failures whose retries both survive reconnect, and stale-retry invalidation;
4. tablet navigation names and rapid optimistic likes whose acknowledgements
   resolve out of order; and
5. an optimistic publish made during initial loading that survives failure,
   retry, and seed merging without route loss.

The suite installs the shared strict browser diagnostics collector before each
navigation. Unexpected page errors and console errors fail the journey. Tests
assert public output, accessibility state, focus, form state, URLs, and the
survivor identity Octane promises; they do not inspect store or compiler internals.

## Rendering scope

Threadline is intentionally client-rendered. SSR and hydration claims belong to
the Wave 1 Cinebase fixture; this example owns external stores, optimistic updates,
keyed reconciliation, native events, and ref-backed focus.

## Commands

```bash
pnpm --dir examples/threadline dev
pnpm --dir examples/threadline typecheck
pnpm --dir examples/threadline build
pnpm --dir examples/threadline test:e2e
```

`test:e2e` rebuilds and drives the production preview. Set
`THREADLINE_EXAMPLE_BASE_URL` to run the same tests against an already-running
deployment. The package's inline environment assignment targets the repository's
documented macOS/Linux/Ubuntu CI environment.
