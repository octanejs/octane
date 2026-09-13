# Fetched conversation history

This companion to `/conversations` exercises later fetched SSR in the same
document. Run the fixture and open `/conversation-history`, or use
`/conversation-history?q=hello&operation=stable-operation-id` to accept a URL
action. The operation ID is idempotent within the authorized viewer; changing
its input is an error. A real host must persist that receipt and schedule work
durably. The shared fixture host is deliberately in-memory.

The route's `before` middleware accepts the URL action. Rendering, hydration,
and history refresh only read its receipt; they never submit a second mutation.
Each later request passes the same authorization middleware. Its document token,
conversation selection, and generation route the response; they do not grant
access. The server checks the requested build against `Context.clientBuild`
before returning private bytes.

`server.ts` caches at most 16 viewer/conversation input snapshots for 60 seconds.
It never caches response HTML, nonces, document identities, or adoption leases.
Every request renders the cached input again under its current region owner,
then streams fresh authoritative snapshots. The renderer's scoped CSS and exact
native signal seed travel with its HTML; production stylesheet identities also
come from the completed-build asset map. Placement revision zero means an empty
slot, so source revision `n` maps monotonically to placement revision `n + 1`.

The browser controller registers one dormant range with
`createStreamedRegionReceiver`. The optional server helper
`createStreamedRegionPlacementFrame(identity, renderResult, options)` packages a
real renderer result for that range. It requires exactly one historical data
owner matching the envelope and rejects separate document-head output. It does
not accept an HTML cache as authority, construct a generic Slot API, or morph
active DOM.

Activation removes only the receiver-owned outer anchors and calls
`hydrateRoot` over the original component output and native seed. After that,
the active renderer exclusively owns the DOM: later result values update
`history$`, while later HTML placements are stale. Conversation selection and
the direct writable draft signals live outside this replaceable history region.
The explicit Scope here belongs to the host's advanced region integration;
ordinary component authors do not need one.

Older pages are finite RPC reads. The controller adopts their real next cursor
only after the response completes, deduplicates by stable turn ID, and retains
completed older pages when the newest page receives another watch update.
Changed authoritative rows refresh already-loaded IDs without revealing unloaded
history. Selection changes fence pending reads. Persisted exit freezes the
explicit region owner and cancels its transport; compatible restore retains
completed content and restarts only unfinished selected/page reads. A restored
read cannot replace retained content with an older cached revision.
The result and HTML have separate revision floors: data may arrive before a
required stylesheet permits its HTML to appear. A result terminal alone does
not complete that delivery; restoring still restarts the unfinished placement.

Evidence is deliberately separated:

- Compiled hydration tests check original DOM adoption and active ownership.
- Deterministic controller tests use real compiled SSR/placement and mock only
  network/RPC delivery to exercise watch/paging races and persisted events.
- The production WebKit test builds both bundles and exercises authorized
  cached-to-fresh SSR, A→B→A draft isolation, URL receipt adoption, stable-node
  activation, and completed-page navigation.

Synthetic persisted events are not proof that a browser entered BFCache. Native
BFCache entry, OS IME, and mobile-device performance need their own evidence.
No Trusted Types policy, global cache, or durable job service is supplied here.
