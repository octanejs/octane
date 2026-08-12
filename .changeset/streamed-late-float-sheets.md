---
'octane': patch
---

Ship Float sheet resources discovered after the streaming shell.

Streaming SSR dropped `<link rel="stylesheet" href precedence>` and
`<style href precedence>` resources whose registration only ran on a
post-shell pass — a sheet inside a nested pending boundary, or one whose href
is computed from a `use()` resolution. Only the shell pass's head ever
flushed, so streamed content revealed unstyled until hydration re-inserted the
sheet client-side, and documents consumed without JavaScript never received
the CSS at all.

Each resolution wave now diffs the pass's per-resource sheet registrations
against what is already on the wire and ships new tags with the wave chunk,
ahead of its segment reveals: real markup in a hidden carrier (so no-JS
consumers still get working CSS) plus an inline `$OCTRH` call that hoists the
tags into `document.head` under the client's precedence grouping. Once client
Float resource state exists, the hoist hands each tag to the live runtime
instead, keeping dedupe and group ordering in one authority, and a hydrating
client adopts the streamed tags without duplicating. A still-pending child
boundary's sheet rides its parent's reveal wave, matching React's hoisting of
partial-boundary resources.
