---
'octane': minor
---

`octane/data`: `read`, `view` and `write` can take the function that serves them as a second argument, so a contract and its implementation live together in its `*.data.ts` module. `defineHandler(Module)` serves each such contract with its own function, and its type accepts the module only when the handler's context provides what those functions need. The Vite and Rspack plugins drop these functions from the client build of the module, together with the imports and module-level constants only they used, so server code never reaches the browser. Inputs and outputs are still validated by the contract's schemas on the server. A contract module may now import types from any module, including `octane/data/server`.
