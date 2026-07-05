---
'octane': patch
---

Hardening + parity fixes surfaced by the ReactDOMComponent conformance port:

- **SSR tag-name validation** (security): a dynamic de-opt tag like `createElement('div><img onerror=…>')` was concatenated verbatim into the server response — it now throws `Invalid tag` like React. (The client was already guarded by `document.createElement` itself.)
- **Client attribute writes are guarded**: an injection-shaped attribute name arriving through a spread used to crash the whole render with `InvalidCharacterError`; it is now reported and skipped, mirroring the SSR serializer's `VALID_ATTR_NAME` rejection.
- **`dangerouslySetInnerHTML` validation** (React parity): a malformed value (not `{__html}`) and combining it with `children` now throw instead of silently rendering; `__html: false` renders `'false'` consistently on both the compiled and spread paths.
- **`<link onLoad>`/`onError` now fire**: hoisted head elements live outside every delegation root, so the compiler now passes `on*` props through and `headBlock` attaches them as direct listeners (SSR skips them).
- **iOS Safari tap delivery**: delegation roots (createRoot containers + portal targets) get a noop `onclick` property so the whole subtree is tappable — the root-delegation equivalent of React's per-element stamping.
- **Boolean style values clear the property** (`fontFamily: true` no longer sets the literal string `"true"`), client + SSR.
- **`suppressContentEditableWarning` never lands in the DOM.**

Documented intentional divergences: no `possibleStandardNames` alias table (attribute names are written as authored — use native spellings like `accept-charset={…}`, valid in TSRX and React alike), and `muted` stays a plain attribute per the no-controlled-properties policy (the live `.muted` property belongs to the platform). Still pinned: void-element children/dSIH validation (compile-time diagnostic planned) and React-19 custom-element semantics.
