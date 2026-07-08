---
'octane': patch
---

`octane/server` now exports the React-compatible element utilities the client entry already had: `isValidElement`, `cloneElement`, `Children`, and `createPortal`. Bindings that inspect or re-project descriptor children (recharts' axis-tick cloning, a Radix-style Slot) compile the same source for both modes, so these imports must resolve under the server build too — previously the SSR bundle failed with missing exports. Server `cloneElement`/`Children` mirror the client semantics over the shared descriptor shape; server `createPortal` mints the PORTAL_TAG descriptor the SSR serializer already renders as a bare site anchor (portal content mounts client-side on hydration).
