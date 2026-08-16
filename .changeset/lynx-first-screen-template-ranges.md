---
'octane': patch
---

Compact safe keyed component rows in the Lynx main-thread first screen into shared host-template range commands.

The compiler now marks component-owned loops for the Lynx main renderer without granting it the broader background template-program capability. The first-screen renderer proves a single-root scalar/event host program, reuses its immutable shape, and sends one existing `mount-template-range` command per row while preserving every host ID, logical range, listener ID, first-tree snapshot, and background adoption identity. Unsupported, observable, nested, hidden, native-list, resource, and non-scalar shapes continue through the generic command path.

In production fresh-page AB/BA runs this reduced 10,000-row public FCP from 1,626.1 ms to 1,411.9 ms (13.2%), exact all-row FCP from 1,596.5 ms to 1,408.4 ms (11.8%), and 30,000-row all-row FCP from 4,704.4 ms to 4,269.2 ms (9.3%). Against the merged main baseline, the controlled rows-zero bundle cost is 1,246 Web gzip bytes (0.92%) and 1,824 Lynx gzip bytes (1.12%).
