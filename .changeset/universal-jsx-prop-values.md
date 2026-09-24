---
'octane': patch
---

Fix universal-renderer compilation of JSX used as a value in expression position — a component prop (`card={<Card/>}`), a sole expression child, or a renderable hole. The universal expression rewriter lowered only nested template nodes, so a root JSX expression passed through to DOM codegen and emitted descriptor-runtime helpers (`createScopedValue`, `createElementFromConfig`) that universal entries such as `octane/universal/native` do not export, breaking native bundles. Root JSX now lowers to the same `universalValue`/`universalComponent` representation as nested JSX.
