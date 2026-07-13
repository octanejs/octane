# Project analysis concerns

Status: source-backed risk register for the current worktree on 2026-07-13.
This is not a claim that every remaining item is a confirmed bug. Re-check the
owning source and executable indexes before acting because Octane is moving
quickly.

The repository now has substantially stronger mechanical guardrails than the
original audit snapshot:

- the generated inventory contains 22 publishable packages, including 18
  framework bindings;
- the core executable React-parity backlog is **0 pins**;
- the binding executable backlog is **8 pins**, all in
  `@octanejs/hook-form`;
- Node 22 and 24 are the tested releases, and every publishable manifest
  declares `engines.node: ">=22"`;
- package inventory, binding status, core/binding failure pins, generated agent
  rules, and publishable tarballs are checked in CI;
- the playground execution boundary, website build serialization,
  request-scoped router state, streaming transport behavior, and Vercel output
  contract now have direct regression coverage.

Resolved concerns remain in this document only when the former failure mode is
important to preserve. The priority list is therefore about current residual
risk, not a history of completed work.

## Priority summary

1. Harden the new `module server` HTTP boundary: method, media type, body-size,
   origin/CSRF, and application authorization policy need explicit contracts.
2. Work through the eight Hook Form pins, separating scheduler/`act()` work
   from intentional native-event and eager-bailout differences.
3. Keep installed raw-source package validation at the consumer seam; workspace
   tests alone cannot prove dependency optimization, SSR externalization, hook
   slotting, and singleton runtime resolution cooperate after packing.
4. Preserve the new SSR/streaming guarantees across Node streams, Web streams,
   template composition, request cancellation, hydration seeds, CSP, and
   multi-root IDs.
5. Keep observable coverage broader than normalized final HTML: effect timing,
   DOM identity, marker topology, focus/live properties, and browser hydration
   still need dedicated suites.

## 1. Website playground execution boundary

Status: **resolved as a security boundary; responsiveness follow-up remains**.

The playground no longer executes compiled code in the website page. The
preview lives in a sandboxed iframe with scripts and forms enabled but without
`allow-same-origin`; its CSP blocks network access, and the parent communicates
through a narrow `postMessage` protocol. A non-default source loaded from a
shared hash may be decoded and compiled for display, but it does not execute
until the visitor explicitly chooses Run.

The hash is bounded before base64 decoding, decoded source is checked before
CodeMirror, Shiki, or the compiler are imported, and editor changes are rejected
at the source-size limit before highlighting. Sandbox boot/readiness and render
result waits produce phase-specific timeout diagnostics. The real-browser
website suite now presses Run and drives an event inside the opaque-origin
iframe in both development and production.

The remaining concern is responsiveness, not authority: compilation and Shiki
tokenization still run on the main page thread. The source cap bounds the work,
but a worker remains worthwhile if profiling shows editor stalls. Do not add
`allow-same-origin`, network-capable CSP directives, or hash auto-execution
without treating that as a security-sensitive design change.

## 2. Sources of truth and repository inventory

Status: **mechanically guarded**.

[`scripts/workspace-packages.mjs`](../scripts/workspace-packages.mjs) discovers
the live package set and generates the CI-checked
[`docs/packages.md`](packages.md). Binding status and executable failure pins
are generated separately:

- [`docs/bindings-status.md`](bindings-status.md) describes supported surface,
  known divergences, SSR/hydration status, and evidence per binding;
- [`docs/parity-gaps.md`](parity-gaps.md) indexes core executable pins;
- [`docs/binding-parity-gaps.md`](binding-parity-gaps.md) indexes binding pins.

Package-wide status, parity, pack, MCP coverage, and release checks share the
manifest-derived inventory. RuleSync remains the only source for generated
agent instructions: edit [`.rulesync/rules/`](../.rulesync/rules/) and run
`pnpm rules:generate`.

The residual risk is social: historical plans intentionally preserve old
decisions and measurements, and a reader can still land in the middle of one.
Current claims should link to the live README, source, generated indexes, or a
clearly dated plan status. New package counts and allowlists should not be
copied into prose or scripts when the shared inventory can answer the question.

## 3. Executable React-parity backlog

Status: **0 core pins; 8 binding pins**.

The old five-core-gap summary is obsolete. The generated core index currently
contains no `it.fails(...)` or `test.fails(...)` cases. That means there is no
known failing behavior pinned in `packages/octane/tests`; it does **not** prove
complete React equivalence. Intentional differences remain documented, and
untested behavior can still diverge.

The live binding index contains eight Hook Form pins. They cluster around four
observable differences:

- automatic batching of notifications separated by effects or microtasks;
- `act()` returning before a later fire-and-forget microtask chain schedules
  its render;
- native input delivery where React's synthetic value tracker suppresses a
  no-op event;
- Octane's eager bailout avoiding a React render-phase re-entry for an
  `Object.is`-equal update.

The first two groups are plausible scheduler/test-harness improvement work.
The latter two match documented platform choices and may remain executable
binding divergences. Resolve pins by changing behavior or clearly classifying
the divergence; do not weaken assertions merely to make the generated count
fall.

Zero pins in a binding is also not a maturity claim. Use
[`docs/bindings-status.md`](bindings-status.md) for scope and evidence.

## 4. What the differential and browser suites cannot prove

Status: **known coverage boundary**.

The differential rig intentionally normalizes comment markers, inter-tag
whitespace, generated IDs, selected counters, attribute order, and empty style
residue. It compares sampled `innerHTML`, so it cannot observe:

- survivor node identity or the physical move set;
- focus, selection, scroll position, or form-control live properties;
- effect/ref timing and cleanup order;
- listener phase/order when final markup is unchanged;
- intermediate Suspense/transition states that a fixture does not sample.

Dedicated conformance, identity, hydration, marker-shape, streaming, and
browser tests cover many of these axes. The website browser suite now checks
all public routes in development and production, fails on page/hydration
errors, exercises client navigation, and interacts with the sandboxed
playground. It still does not replace the Hacker News or Lexical example E2E
suites, which are not part of root `pnpm test`.

When adding a feature, choose the suite by observable rather than assuming a
final-HTML differential test is sufficient.

## 5. Compiler/runtime contracts and hook slotting

Status: **duplicated tables resolved; emitted ABI remains a compatibility
surface**.

DOM truth tables now live in
[`packages/octane/src/dom-tables.js`](../packages/octane/src/dom-tables.js) and
are shared by the compiler and runtimes. Direct tests pin identity and
representative compile behavior, including the formerly divergent static style
trimming path.

Hook compilation has also become more explicit:

- public `useState` and `useReducer` always expose the stable third getter;
- compiled sites use private two-item helpers only when tuple index 2 is proven
  dead;
- named aliases, namespace imports, and default imports are discovered;
- slot-keyed hooks in plain JavaScript loops are compile errors;
- manual slot-forwarding packages declare their source directories in their
  own manifests;
- installed raw-source Octane packages bypass dependency prebundling and SSR
  externalization so the compiler can lower TSRX/TSX and slot plain TS/JS;
- runtime resolution is deduped around the `octane` peer.

The remaining concern is the breadth of the compiler-emitted helper ABI:
template/slot helpers, binding bags, form bindings, control-flow blocks,
parallel-`use()` plans, HMR, server RPC stubs, and binding infrastructure all
have to match the installed runtime. Exact `0.x` peer contracts and packed
consumer tests reduce the risk, but a future independently released compiler
or binding can still couple to a helper introduced by a newer core. Keep
private helper changes covered in both development and production compile
modes, and consider an explicit compiler/runtime ABI version if independent
version skew becomes common.

## 6. SSR and streaming lifecycle

Status: **transport contracts implemented; feature gaps remain explicit**.

The server renderer now has direct coverage for:

- render-scoped opaque streaming IDs, preventing collisions when streams share
  a document;
- full streamed hydration-seed IDs and root-local `useId` namespaces with
  `identifierPrefix`;
- Node `write(false)`/`drain`, destination error/close cancellation, and abort
  while backpressured;
- pull-driven bounded Web streams, consumer cancellation, and `allReady`
  settling only after chunks are accepted;
- CSP nonces on every inline style, seed, swap, and recovery artifact;
- request `AbortSignal` propagation through buffered and streaming plugin
  renders;
- template composition that preserves upstream pull/cancel behavior.

This area remains cross-layer and high-coupling. Any change to boundary IDs,
marker ranges, seed ordering, template wrapping, destination ownership, or
nonce emission needs core renderer, plugin, hydration, and browser validation.

Known product gaps are listed in [`docs/ssr.md`](ssr.md): hydration is still
whole-tree rather than selective/progressive, head elements discovered inside
an already-flushed boundary are recreated on hydration rather than streamed,
framework loader data is not serialized automatically, and post-shell errors
do not have React-style digests.

## 7. Marker protocol and DOM weight

Status: **M0-M4 landed; further elision has diminishing returns and higher
coupling**.

[`docs/comment-marker-elision-plan.md`](comment-marker-elision-plan.md) is the
current detailed record. The old statement that M3 remained to land is stale:
M3 inherited sole-component ranges across client, server, and hydration, and
M4 removed additional chart-internal client-mount markers. Exact marker-shape
tests and per-route browser ceilings remain deliberate contracts.

The remaining buckets are order- or ownership-sensitive:

- multi-hole host anchors whose positions must survive independent updates;
- component-bearing keyed-item ranges;
- sole-root control-flow and children/value-position cases not covered by M3;
- server/hydration symmetry for client-only owns-parent regimes.

Markers are load-bearing for teardown, reordering, Suspense detach/reveal,
Activity, portals, streaming swaps, and hydration alignment. Optimize only
with client/server/hydration symmetry and identity assertions; an Elements
panel target is not a reason to remove an ownership boundary.

## 8. Parallel `use()` evaluation timing

Status: **intentional divergence with a tested opt-out**.

The default pipeline memoizes promise creation, starts proven-independent work
together, batches a stratum, and warms independent descendant plans. This
avoids React's serial Suspense waterfall, but it can start expressions earlier
than source-order React and can begin speculative work for a subtree that never
commits.

`parallelUse: false` must remain a stable escape hatch. Proof should stay
conservative: a false negative costs performance, while a false positive can
change externally observable behavior. Renderer aborts stop Octane's work, but
there is still no general way to cancel arbitrary user-created promises, so do
not imply that speculative fetches are automatically aborted.

## 9. Scheduler and process-wide client coordination

Status: **documented design limits, also visible in binding parity**.

Octane uses a synchronous two-priority scheduler rather than lanes and
time-slicing. The async transition counter remains process-wide across awaited
transition actions, so an unrelated update during that window can be tagged as
transition work. Suspense hold/reveal and ViewTransition coordination also use
shared registries.

The first-boundary ViewTransition reveal path is now compiler-hinted before the
snapshot, including alias/namespace detection without treating an unused
namespace import as a boundary. That closes the known first-mount miss, but it
does not turn the scheduler into per-action concurrent isolation.

The Hook Form pins show the practical remaining difference: Octane often
flushes microtask-separated notifications as separate renders where React's
automatic batching produces one commit. Avoid stronger batching/concurrency
claims until those semantics are either implemented or documented as stable
divergences with multi-root tests.

## 10. Metaframework request, RPC, and deployment contracts

Status: **major request/render gaps resolved; RPC ingress hardening remains**.

The website project is file-serial by contract, so its two real production
build tests cannot delete or rewrite the same output concurrently. Server
routers are request-scoped in `Context.state`; server-only page state is handed
to rendering but is not serialized to the browser. Client pre-hydration router
waiting now throws a local diagnostic instead of silently proceeding after its
bound.

The Vite plugin now validates exactly one head marker, one body marker, and one
closing body tag; loads importable root pending/catch boundaries in dev,
production, and hydration; propagates CSP nonce and request cancellation;
preserves stream backpressure through HTML composition; and compiles/bundles
`module server` declarations for dev and production. The Vercel adapter emits
the current response-streaming flag and adjacent ISR prerender configuration.

The new server-function endpoint is the clearest missing hardening item. The
shared RPC handler currently resolves a function hash and reads the whole
request body, but does not itself enforce:

- `POST` or a specific request media type;
- a maximum encoded body size;
- same-origin/CSRF policy;
- authentication or per-function authorization.

Applications must authorize mutations inside server functions today. Before
presenting `module server` as a production-safe mutation boundary, define and
test the framework defaults, proxy/origin behavior, body limits, and extension
points for application policy. Also ensure error responses do not expose
sensitive exception messages in production.

## 11. Ecosystem maturity is package-specific

Status: **made explicit by generated status metadata**.

The bindings do not all have the same surface or parity evidence. Thin ports
over framework-agnostic cores, broad component libraries, and intentionally
partial alpha packages should not share an undifferentiated “React-compatible”
claim. [`docs/bindings-status.md`](bindings-status.md) is the canonical table,
generated from each binding's `status.json` and checked in CI.

Keep README and website claims linked to that table. Update status metadata
when supported surface, upstream version, known divergence, SSR/hydration
evidence, or parity verification changes. The eight executable Hook Form pins
are tracked independently from those broader scope statements.

## 12. Benchmark correctness and performance policy

Status: **correctness policy resolved; performance ratchets remain reviewed
data**.

Harness correctness failures are fatal by default. A waiver requires a reason
and expiry, so a broken harness cannot silently pass because no performance
ratio happened to breach. Performance ratios remain intentionally tolerant,
and only selected operations have committed guards.

Deterministic size thresholds can sit close to their ceiling. A compiler
feature that legitimately adds output should update the baseline as an explicit
reviewed ratchet, not by weakening or deleting the gate without measurement.

## 13. Release, package, and compatibility discipline

Status: **guarded around the supported baseline**.

CI tests Node 22 and 24. The root and every publishable package declare a Node
22 minimum, the website deploy target is Node 24, and the Vercel adapter accepts
only supported runtime names.

`pnpm packages:pack:check` discovers and packs every publishable package,
checks the post-pnpm manifests, resolves exports/bin/types, rejects test
artifacts, and verifies that intentionally published raw TS/TSRX survives. It
also installs packed core and Hook Form into an isolated consumer and asserts
one physical Octane runtime before running Vite client/server builds. The
validator contains an executable Hook Form SSR probe as well; treat that as a
proven runtime gate only when the complete `pnpm packages:pack:check` run
passes. Vite discovers direct installed raw Octane dependencies, excludes them
from prebundling/SSR externalization, and preserves manifest-declared manual
hook-slot directories.
Bindings and the Vite plugin peer on Octane while retaining workspace-only dev
dependencies; the adapter peers on the plugin.

Publishing is a dependent job in the same CI workflow as tests, generated-file
checks, typechecking, and package validation, so npm receives the exact
validated SHA. Continue to use patch changesets while the packages are `0.x`.

The important residual is seam depth: a tarball inspection or successful
bundle does not by itself prove a raw-source hook runs correctly. Keep an
executed installed-consumer path in the package gate and expand it when package
compiler requirements change.

## Suggested next work

### Correctness and security

- define method, content type, size, origin/CSRF, authorization, and production
  error-disclosure contracts for `module server` RPC;
- triage the eight Hook Form pins by scheduler, `act()`, native-event, and
  eager-bailout category;
- preserve an executed packed-consumer hook path, not just tarball and bundle
  inspection.

### Cross-layer regression coverage

- keep streaming changes covered through core Node/Web transports, plugin HTML
  composition, cancellation, nonce emission, and real hydration;
- add release-gated browser coverage for examples when changes touch their
  router/query/style/editor integrations;
- keep marker topology and DOM identity assertions beside normalized
  differential tests.

### Measured optimization

- pursue remaining marker elision only where profiling justifies the ownership
  complexity;
- preserve the `parallelUse` opt-out and conservative dependency proof;
- move playground compilation/highlighting to a worker only if measurements
  show the bounded main-thread work is user-visible.
