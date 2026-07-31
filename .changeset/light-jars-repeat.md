---
'@octanejs/mcp-server': patch
---

Port guidance now asks for the pinned upstream source and its tests. `bridge-react-package`, the `octane_bridge_react_package` plan steps, and the `octane_engineering_plan` gates for binding paths all require bridging module by module from a pinned copy of the upstream release, covering its exports rather than the demo path, running that release's own suite as the parity oracle where it ships one, and recording whatever parity cannot reach as a divergence.
