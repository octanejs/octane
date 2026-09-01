---
'octane': patch
---

Keep ordinary delegated continuous-event updates responsive while an unrelated async transition Action is pending. Continuous events retain microtask batching, and updates explicitly wrapped in a transition still wait for the Action.
