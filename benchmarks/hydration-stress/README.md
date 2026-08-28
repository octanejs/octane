# Hydration stress

This suite extends the production seven-framework hydration benchmark with real
keyboard activation while the client hydration chunk is withheld and Chromium
is CPU-throttled 6×. It also reruns uncontrolled and controlled typing, focused
DOM adoption, pointer replay, and exact search-and-Send delivery.

Each activation records whether the event was replayed, handled by React's real
selective-hydration root, or dropped. Reference-framework capability gaps are
published explicitly; Octane must deliver every interaction exactly once.

```bash
node benchmarks/bench.mjs --quick hydration-stress
node benchmarks/bench.mjs hydration-stress
```
