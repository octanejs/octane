---
'@octanejs/lynx': patch
---

Make Octane run on Lynx for Web: validate cross-realm messages, and accept a null native event target id.

The two Lynx threads are separate JS realms in production — on Lynx for Web the
background runs in its own iframe/worker — so every message, host-prop bag,
worklet capture, and engine lifecycle record a thread receives is a plain object
carrying the _sender realm's_ `Object.prototype`, never identical to the
receiver's. Octane's plain-object validators tested
`Object.getPrototypeOf(value) === Object.prototype`, a realm-local identity
check, so main rejected every message the background sent. The readiness
handshake never completed (`main-ready-request` bounced with "must be a plain
object"), so the background never committed and nothing rendered or updated:
`firstScreenRender: 'engine'` painted a blank screen, and every tap was dropped.
The single-realm jsdom suite could not observe any of this, because both threads
share one realm there. A shared `hasCrossRealmPlainPrototype` predicate now
accepts a null prototype or any prototype that is itself one hop from null — the
shape of every realm's `Object.prototype` — across the protocol, host driver,
host props, lifecycle data, worklet, and main-thread validators, while the
descriptor walks still enforce enumerable, non-accessor, symbol-free data.

Separately, `@lynx-js/web-core` reports an element with no author id as
`target.id === null`. The native event payload snapshot required a string id and
threw, so once the handshake was fixed a tap still died in the validator. The
snapshot now accepts `null` and normalizes an omitted `undefined` id to `null`,
keeping "no id" distinct from an author-assigned empty-string id and matching the
PAPI's `__SetID(node, id: string | null)`.
