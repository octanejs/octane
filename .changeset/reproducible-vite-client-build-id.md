---
'@octanejs/vite-plugin': patch
---

Make Vite production builds reproducible. The client build identity that the hydration entry carries is now a hash of the rendered client modules rather than a random UUID, so building unchanged sources again, or from another checkout path, emits byte-identical client and server files. A source change still produces a new identity and a new hydration entry file name. Development and HMR identities are unchanged.
