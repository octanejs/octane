---
'@octanejs/lynx': patch
---

Deliver native Lynx events to background handlers, and roughly halve dual-thread render cost.

`__AddEvent` installed Octane's listener tokens correctly, but nothing received
them: the engine resolves a background `bind*`/`catch*` token by calling
`lynxCoreInject.tt.publishEvent` on the background thread, and Octane never
listened there. Every tap was dropped, so click-driven interaction did not work
in a real application. The background root now installs that receiver, chaining
any previously installed one, declining tokens it does not own, and containing
its own errors. Listener priority travels inside the token so the background can
build a valid transported event message without a round trip to main, and one
native propagation path is delivered as a single Octane event scope.

A tap can also land between main applying a commit — which is when it installs
the `__AddEvent` tokens, so the element becomes tappable — and the background
accepting that commit's acknowledgement. Such a delivery is early, not stale, so
it is held for the acknowledgement it is racing and dispatched once the host is
published, rather than dropped.

Mount cost is also down about a third to a half. Public handles for accepted
host nodes are now compact entries whose frozen facade, `NodesRef` query
binding, and defensive snapshot clone are built on first use rather than once
per node; outbound transport messages are self-checked in development only,
since the receiving thread validates every inbound message regardless; and the
per-node validation and prop-diff paths no longer allocate message paths,
descriptor objects, or empty dataset and event-name bags on the success path.
On the new `lynx-render` benchmark this moves 1,000 rows from 111ms to 72ms and
10,000 rows from 1293ms to 731ms.
