# Wayfinder

Wayfinder is a polished, deterministic city-break planner built in TSRX. It is
also the Wave 4 fixture for Octane’s parallel `use()` compiler path, streaming
Suspense order, request supersession, CSP nonce propagation, and server DOM
adoption.

## Product journeys

- Search four locally seeded city editions by place, mood, or interest, with
  explicit loading, empty, failure, and retry states.
- Deep-link to `/trips/:tripId?month=apr|jun|oct`, change the travel month, and
  inspect a paired route and stay plan plus independently streamed weather and
  fare insight.
- Save a journey to the device-local `/saved` shelf and keep a trip note through
  a reload.
- Use the critical path by keyboard and at a narrow mobile viewport. Native
  links, buttons, search, select, textarea, focus rings, landmarks, and a skip
  link remain available.
- Rapidly replace a deliberately slow `lo` search with `ky`, or switch from a
  pending Lisbon plan to Kyoto, without stale work replacing the latest route.

All data and latency live in `src/data.ts`. No CI journey contacts a booking,
weather, mapping, font, image, or analytics service.

## Rendering and CSP contract

The `@octanejs/vite-plugin` production server renders every route through the
real streaming SSR path. Trip heroes, notes, navigation, day plans, and pending
cards arrive in the shell. The fare boundary appears earlier in DOM order but
resolves after the weather boundary, so the HTTP body publicly reveals weather
first and fares later. Hydration adopts the resulting DOM and Suspense seeds.

A request middleware stores a nonce under `OCTANE_NONCE_STATE_KEY`, returns a
real `Content-Security-Policy` header, and leaves inline script execution
available only to nonce-bearing renderer output. The CSP journey observes the
response header, records browser `securitypolicyviolation` events, and then uses
post-hydration controls. This checks security behavior without inspecting
compiler helpers or renderer marker spelling.

`?hydrateDelay=650` delays `hydrateRoot` through the documented `preHydrate`
hook. The adoption journey captures the server trip heading, types in the live
textarea before hydration, and proves that the same heading node and note value
survive before saving and reloading.

## Why the paired plan proves parallel `use()`

`PairedPlan` contains two ordinary independent reads:

```tsrx
const route = use(props.run.route());
const stays = use(props.run.stays());
```

The request-local `PlanningRun` is a functional handshake: neither promise can
complete until both loader methods have started. A sequential first read would
reach the boundary before starting the second and the visible plan would fail;
successful route and stay content therefore proves same-stratum discovery
without asserting elapsed milliseconds, render counts, helper names, or emitted
code. The server keeps each run in the request-scoped middleware state map so
streaming passes remain isolated across concurrent requests; the browser uses a
component memo for the same stable resource identity.

## Deterministic recovery scenarios

- `lo` takes longer than `ky`; starting the latter aborts the former and exposes
  a consumer-facing cancellation status.
- Searching `outage` fails until the Retry action marks the next deterministic
  lookup as recoverable.
- `?scenario=weather-failure` rejects one weather resource into `@catch`; the
  Retry button resets the boundary with a new attempt.
- Unknown destinations and empty searches have navigable, labelled states.

## Commands

```bash
pnpm --dir examples/wayfinder typecheck
pnpm --dir examples/wayfinder build
pnpm --dir examples/wayfinder dev
pnpm --dir examples/wayfinder test:e2e
```

`build` emits both the production client and self-contained SSR server.
`test:e2e` builds once, allocates a local port through the shared example
utility, and drives exactly five Playwright journeys against that production
server. Set `WAYFINDER_EXAMPLE_BASE_URL` to drive an already-running deployment.

## Octane evidence

- Compiler-parallelized independent `use()` creations with a functional
  mutual-start oracle
- Out-of-order streaming Suspense reveals in reverse DOM order
- Request-scoped server resources and stale boundary supersession
- Native `AbortController` cancellation and late-result isolation
- CSP nonce propagation through streaming, hydration data, and hydrate scripts
- Server DOM adoption, preserved pre-hydration form state, and live events
- TSRX `@try` / `@pending` / `@catch`, keyed lists, controlled inputs, refs, and
  native delegated events
