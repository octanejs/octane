---
'@octanejs/scan': patch
---

Add `useScan` (the hook variant, forwarding its compiler-appended call-site
slot to `useEffect` per the manual hook-slots ABI) and the click-to-inspect
inspector v1: an inspect toggle on the toolbar arms capture-phase picking —
clicking a component shows its identity, source location, render/bailout
counts, self time, and the profiler's actual schedule causes; Escape exits
and restores normal interaction. The scan UI itself stays operable while
armed and remains invisible to the profiler.
