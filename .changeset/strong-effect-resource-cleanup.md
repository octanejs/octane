---
'octane': patch
'@octanejs/mcp-server': patch
---

Add `OCTANE_STRONG_EFFECT_RESOURCE_LEAK`. Platform resources acquired in Strong effect setup must be released by the returned cleanup: event listeners on browser targets, `matchMedia` lists, attached elements, and connections (by matching `removeEventListener` or an aborted signal), `on<event>` handler properties, intervals and self-rescheduling timers, `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, and `PerformanceObserver`, `WebSocket`, `EventSource`, and `BroadcastChannel`, and geolocation watches. User objects' subscriptions stay legal. Compatibility modules and emitted code are unchanged.
