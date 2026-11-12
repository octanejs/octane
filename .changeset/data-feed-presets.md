---
'octane': minor
---

Add WebSocket and broker listeners to `octane/data` feeds, and resume feeds across restarts. `webSocketListener(url)` streams feeds over a socket that `handler.accept(socket, request, caller)` serves with no time limit, refusing other origins; `encode` and `decode` adapt an existing socket protocol. `pubSubListener(subscribe)` listens through a broker the page already uses. A store with `persist` saves each feed's cursor with its stale marks, so the next session replays what it missed, and a saved value an event could not reach in memory is restored stale.
