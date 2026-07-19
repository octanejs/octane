---
'@octanejs/scan': patch
---

Fix component naming and round out the toolbar. Names no longer read `Unknown`
on hydrated pages: the package now starts the profiler at import (before
hydration) so every mounted component registers, and a shared element→component
registry resolves clicks/hovers against it (seeded from the profiler's event
buffer for instances that mounted before scanning attached). The inspect toggle
now draws a hover outline with the component name over the element under the
cursor and locks the panel on click. The toolbar is draggable and snaps to any
of the four corners (persisted). The Prompts tab gains Fix / Explanation / Data
LLM-prompt sub-tabs ported from react-scan's optimize view. The Alerts toggle
now sounds a confirmation chime and creates its AudioContext inside the user
gesture so later chimes are allowed to play.
