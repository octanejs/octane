---
'octane': patch
---

Universal signal bindings for local signals and style objects. `useSignal$` works in universal renderer modules: the universal compiler routes `octane/signals/client` (and `/server`) to the new `octane/signals/universal` entry, whose `useSignal$` keeps its signal in a component-local cell of the universal owner (created once, disposed on unmount, kept while an Activity hides the component), so a module with a local signal never reaches the DOM runtime. A `style` object whose values include signal handles binds as one source: a write to any of them sends one `update` with the whole style, without rendering the component again, and in template programs the style stays a structured program value. A signal handle passed as a host event handler now fails with an error that names the function to write instead.
