---
'@octanejs/react-map-gl': patch
---

Keep a `<Layer>` drawn when its `beforeId` names a layer that is not in the style yet. The layer stays in place until its anchor is added, then moves beneath it, instead of being dropped from the map by Mapbox's `moveLayer`.
