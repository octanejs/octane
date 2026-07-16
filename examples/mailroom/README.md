# Mailroom

Mailroom is a polished, local-first email client built in `.tsrx` with the real
`@octanejs/remix-router` data-router APIs. Its messages, drafts, action outcomes,
and fault consumption are deterministically scoped by the `session` query, so
the browser journeys never depend on a live service.

## Run it

From this directory:

```bash
pnpm dev
```

Open `http://127.0.0.1:5230/mail/inbox/launch-window`. Every mailbox, message,
and draft has a deep link. The maintained gates are:

```bash
pnpm typecheck
pnpm build
pnpm test:e2e
```

`test:e2e` production-builds the TSRX client and drives all seven journeys in
Chromium with the shared browser console and page-error diagnostics enabled.

## Observable Octane and router evidence

- `createBrowserRouter` owns real loaders, an action resource route, nested error
  boundaries, revalidation, deep links, and browser-history navigation.
- Message stars, draft saves, online sends, and reconnect delivery use real
  `useFetcher` submissions. A shell-mounted fetcher shares the message mutation
  key, so an in-flight action remains observable and completes after its detail
  route unmounts. `useFetchers` exposes that overlap as an accessible global
  status without asserting router internals.
- `useBlocker` guards dirty compose routes. Its accessible dialog receives focus,
  keeps the URL in place, restores focus to the message editor when cancelled,
  and permits navigation only after save or explicit discard.
- Native `online` and `offline` events change the visible connection and send
  controls. Offline send stores the complete draft in a durable outbox; the
  shell's reconnect fetcher delivers queued items one at a time and router
  revalidation updates Outbox and Sent.
- The seeded application distinguishes initial loading, empty folders, missing
  messages, unknown routes, rejected loaders, rejected mutations, retry, and
  offline work. Query-selected faults are consumed once per deterministic
  session.
- Critical links and actions are keyboard reachable, focus outcomes are tested,
  and the three-pane layout collapses into a usable compact mailbox with durable
  accessible navigation names below 680px.

## Seven Playwright journeys

1. Open a message deep link, keyboard-navigate to another thread, star it through
   a fetcher without changing the URL, and prove the result survives reload.
2. Use every named mailbox link in the compact mobile navigation by keyboard and
   prove the collapsed layout remains usable without page overflow.
3. Edit a saved draft, attempt navigation, cancel the focused blocker dialog,
   verify editor focus and text, save through a fetcher, then leave and reload.
4. Move between saved and new draft routes, reset stale fields and errors, discard
   dirty state, then save twice through one adopted draft identity without creating
   a duplicate.
5. Compose while Chromium is natively offline, queue the complete message,
   remount the Outbox route, reconnect, and prove automatic delivery reaches Sent.
6. Recover a one-shot inbox loader failure by keyboard, then distinguish an empty
   archive, a missing message link, and a wholly unknown route.
7. Begin a slow shared fetcher mutation, navigate while its global pending state
   remains visible, verify completion, then reject and explicitly retry an online
   send without losing any field.

Every assertion stays at the consumer boundary: URL, rendered mail, focus,
accessible pending/error state, persistent form values, and working browser
events. No journey inspects compiler output or private router state.
