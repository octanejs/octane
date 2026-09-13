---
'@octanejs/grab': patch
'octane': patch
---

Port `@octanejs/grab` overlay UI from Solid to Octane and add `createRoot({ inspect: false })` so tool overlays stay out of `octane/inspect` owner stacks. App authors can still mark subtrees with `data-react-grab-ignore`.
