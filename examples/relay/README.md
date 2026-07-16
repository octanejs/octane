# Relay

Relay is a product-shaped team workspace built in `.tsrx`. It connects to a real,
same-origin `EventSource` endpoint served by the example's deterministic Node
server, rather than calling a subscription callback directly from the component.

The app includes connected channels, a deep-linked thread panel, message and
thread composers, reactions, responsive navigation, a quiet-channel empty state,
recoverable history loading, and an explicit live-update pause/reconnect flow.
All names, messages, network timing, and incoming events are local fixtures.

## Run it

From this directory:

```bash
pnpm dev
```

Open `http://127.0.0.1:5224/channels/general`. The dev command runs Vite as
middleware inside the same server that owns `/api/history`, `/api/messages`, and
`/api/stream`, so development and production exercise the same subscription
boundary.

The maintained gates are:

```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

`test:e2e` builds the production client, starts `server.mjs` with
`RELAY_DIST=1`, and drives Chromium against that server.

## Observable Octane evidence

- The browser opens a public SSE response with `text/event-stream`; teammate and
  optimistic messages only become confirmed when their server event arrives.
- Each connection resumes from the last observed sequence. Missed messages replay
  after reconnect, while message and client-request IDs prevent duplicates.
- Earlier history is prepended through a keyed `@for`. A layout effect restores
  the original message's screen position while Octane retains its DOM identity and
  the history control retains keyboard focus.
- `/channels/:channel/thread/:message` renders a connected, keyboard-operable
  thread through an Octane portal. Escape closes it and restores focus to the
  invoking reply link or channel heading.
- Native submit, input, and keyboard events drive both composers. Rapid sends are
  intentionally acknowledged in reverse order to protect optimistic convergence.

## Five Playwright journeys

1. Open a thread URL at a mobile viewport, add a reply with
   <kbd>Control/Command</kbd>+<kbd>Enter</kbd>, close with <kbd>Escape</kbd>, and
   navigate to populated and empty channels.
2. Prove the production SSE response headers, receive a teammate event, and
   reconcile an optimistic message exactly once.
3. Load earlier history while observing the survivor node, its screen position,
   the conversation scroll offset, and keyboard focus; then release a stale
   general-channel page after navigating to design and prove it is ignored.
4. Pause updates, queue two events, reconnect without duplicates, and settle two
   optimistic sends whose acknowledgements arrive out of order.
5. Trigger `?fault=history`, preserve a draft through retry, then visit the
   intentional `#random` empty state.

Every journey installs the shared browser diagnostic collector before navigation
and fails on uncaught page errors or unexpected console errors.
