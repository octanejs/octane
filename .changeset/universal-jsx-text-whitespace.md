---
'octane': patch
---

Keep JSX text whitespace in universal plans the way the DOM compiler does. Text next to an inline element keeps its edge space (`Before <span>` no longer renders as "Before" glued to the span), a single space between two elements is kept, and tabs inside a line become spaces.
