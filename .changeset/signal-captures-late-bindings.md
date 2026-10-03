---
'octane': patch
---

Re-run a component-local `derived$` or `query$` whose closure reads a variable that is declared after the declaration or assigned again. Such a value is still `undefined`, or not yet final, where the declaration runs, so comparing it could not show that the closure would compute the same result. The declaration kept its first render's closure and value after that variable changed. A declaration inside the initializer of a variable its closure reads, such as `const api = { count$: derived$(() => api.items.length), items }`, threw a `ReferenceError` instead. These declarations now reevaluate on every render, as they did before captured values were compared.
