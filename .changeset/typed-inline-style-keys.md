---
'octane': patch
---

Support property-specific kebab-case CSS names in `CSSProperties`, including signal-backed HTML and SVG styles. Preserve Octane's numeric length support: `width: 400` still means `400px`. Runtime style handling is unchanged.
