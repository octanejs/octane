---
'octane': patch
---

Support kebab-case CSS property names and custom properties in `CSSProperties`, including signal-backed HTML and SVG styles. Preserve property-specific value checking and Octane's numeric length support: `width: 400` still means `400px`. Runtime style handling is unchanged.
