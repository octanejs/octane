---
'@octanejs/motion': patch
---

Preserve host styles and layout FLIP transforms across style MotionValue rebinds.

Style MotionValue effects patch individual transform functions on the live CSS
string, decompose compound layout FLIP `translate(...)` / `scale(...)` forms into
shorthands when a style MotionValue binds so unbind can clear only that axis,
leave untouched compound forms alone on unbind, and leave plain static style
values alone when a key switches from a MotionValue to a host-owned value.
