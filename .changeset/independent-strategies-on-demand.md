---
'octane': minor
---

Load the `idle()`, `visible()` and `media()` triggers for independent `Hydrate` widgets only when a page has a widget that uses one. The independent island bootstrap used to import all three, so every islands page shipped them, even one whose widgets used only `load()` and `interaction()`. The signal-chat islands-only route now loads 612 fewer bytes of gzipped JavaScript. A widget with one of these triggers loads the strategies the first time the bootstrap registers it, then installs its trigger. A custom host can pass `strategies: independentHydrationStrategies`, from the new `octane/hydration/independent-strategies` entry, to `bootstrapIndependentHydration` or `registerIndependentHydrationIsland` to install triggers during registration instead.
