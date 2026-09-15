---
'@octanejs/mobx': patch
'octane': patch
---

Update the MobX binding to mobx-react-lite 5.0.3 and MobX 7.0.3. Preserve the existing observer and static-rendering aliases, generic component props, typed Map stores, and custom component statics. Dispose abandoned observers through the upstream finalization fallback and avoid retaining the initial render closure. Applications that import MobX directly should use a compatible MobX 7 version.

Compile JSX created inside ordinary callbacks during the callback's execution. This restores observable tracking in Observer, useObserver, and observer callbacks while preserving represented render scopes for stored JSX values. Cover client rendering, SSR, hydration, focus, refs, and subscription cleanup.
