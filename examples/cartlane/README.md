# Cartlane

Cartlane is a complete, deterministic commerce and checkout application written
in TSRX. It is the Wave 2 system fixture for Octane's React 19-shaped native form
actions and the `@octanejs/vite-plugin` production server-function boundary.
There is no React compatibility layer and CI contacts no live product, payment,
font, or image service.

## Product journeys

- Browse six considered home, desk, and travel products; search or filter the
  collection; open a deep-linked `/products/:id` page; and add quantities with a
  native form.
- Adjust or remove keyed basket lines, see delivery thresholds and totals, and
  follow a deep-linked `/cart` → `/checkout` → `/orders/:id` flow.
- Submit contact, delivery, and fixture payment details. Accessible server
  validation leaves every uncontrolled field intact for correction.
- Recover from the documented `4000 0000 0000 0000` fixture decline, disconnect
  during checkout, reconnect, and safely retry with `4242 4242 4242 4242`.
- Use the critical product and checkout paths with the keyboard. The responsive
  layout retains its basket, search, form labels, focus styles, and offline state
  at a 390-pixel viewport.

The basket and latest receipt live in browser storage so an order route remains
usable after reload. Products and order timestamps are fixed repository data;
this is an executable framework fixture, not a payment implementation.

## Native forms and server functions

Product and quantity controls use function-valued native `<form action>` props.
Their submit controls read `useFormStatus()` from inside the form, so pending UI
is tied to the browser submission that owns it. Checkout uses
`useActionState()` and preserves fields after validation, network failure, or a
decline instead of copying form values into component state.

`placeOrder` is declared in a real `module server` block in `src/App.tsrx` and
imported from `server`. In development the Vite plugin resolves it through the
SSR module graph. The production build discovers the same module statically,
bundles it into `dist/server/entry.js`, and exposes its devalue RPC endpoint
through `octane-preview`. The release-gated Playwright command runs the same
five journeys against that production server and Vite's development server. It
explicitly observes the public POST response and pending form UI on both
boundaries without pinning the plugin's private transport path.

The cart field is client-controlled input, so the server function accepts an
unknown request and reconstructs trusted lines from the server-owned catalog.
It rejects malformed IDs, duplicates, and quantities outside 1–8, then computes
prices and totals itself. The checkout journey tampers that hidden field, proves
there is no order or charge, and restores the valid payload for a successful
retry.

Every checkout session supplies one idempotency key. Two rapid native submits
are intentionally queued by `useActionState`; both RPC calls finish, but the
server returns the same order reference and the UI reports one charge. The test
asserts the final receipt and visible duplicate resolution, not a private action
queue or compiler helper.

## SSR and hydration evidence

Every route is streaming-server-rendered by `@octanejs/vite-plugin` and hydrated
by its generated client entry. The deep-product journey asks the public
`preHydrate` hook for a short delay, captures the server quantity input, edits it
before hydration, and proves that Octane adopts the same node with the live value
intact. The form then submits by keyboard after hydration. Shared diagnostics
fail the suite on page errors, console errors, or hydration-mismatch warnings.

Other deterministic states are available through public interactions or URLs:

- `/?scenario=catalog-failure` fails one collection load and then retries;
- a search with no matching product renders the empty collection state;
- browser offline mode keeps browsing and the basket available but pauses
  checkout;
- the fixture `4000` card returns a recoverable server decline;
- a receipt reload proves the `/orders/:id` route remains deep-linkable on the
  device that placed it.

## Commands

From the repository root:

```bash
pnpm --dir examples/cartlane typecheck
pnpm --dir examples/cartlane build
pnpm --dir examples/cartlane dev
pnpm --dir examples/cartlane test:e2e
```

`test:e2e` builds both the browser and self-contained SSR server bundles, runs
exactly five Playwright journeys against `octane-preview`, and then runs those
same five journeys through Vite's development RPC path. The narrower
`test:e2e:production` and `test:e2e:dev` scripts remain useful while iterating.
Set `CARTLANE_EXAMPLE_BASE_URL` to an absolute HTTP(S) URL to drive an
already-running deployment. Local development defaults to port 5225;
Playwright allocates an isolated loopback port.

## Observable Octane claims

- Function-valued native forms auto-dispatch and publish descendant
  `useFormStatus` state.
- `useActionState` keeps field values, queues rapid actions, and converges after
  validation, decline, offline failure, and retry.
- `module server` produces the same real RPC behavior in development and in the
  production SSR bundle.
- Session idempotency prevents rapid duplicate submissions from creating or
  charging a second order.
- Streaming SSR and hydration adopt a pre-edited native input without replacing
  it or losing its value.
- Responsive, keyboard, loading, empty, error, offline, and deep-link outcomes
  remain visible and accessible.
