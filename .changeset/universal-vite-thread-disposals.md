---
'octane': patch
---

Fix leaked thread functions under Vite HMR in modules with more than one thread-owning universal unit, such as a universal module whose renderer region also uses `main-thread:` handlers. Vite runs only the last dispose handler a module registers, so each edit used to unregister only the last unit's thread functions. Every unit now queues its cleanup on `import.meta.hot.data`, and the one handler Vite keeps runs all of it.
