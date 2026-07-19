---
'@octanejs/scan': patch
---

Re-port the outline overlay and toolbar directly against react-scan's source
for visual/behavioral parity. Outlines now match `new-outlines/canvas.ts`
exactly — indigo `rgb(115,97,230)`, a pixel-snapped 1px stroke with a faint
interior fill, a 45-frame linear fade, `lerp` easing toward each re-measured
rect, and `getLabelText` grouping. The toolbar now mirrors react-scan's bar —
an inspect toggle (crosshair/focus icons), the "Outline Re-renders" power
switch driving `enabled`, and a color-graded FPS meter — replacing the earlier
text-button approximation. The FPS meter is ported 1:1 from react-scan's
frame-count loop. `animationSpeed` stays a programmatic option (`off` disables
the overlay, `slow` doubles the fade life); the upstream bar has no speed
control, so ours dropped it too.
