---
'@octanejs/i18next': patch
---

Keep a component on its Suspense fallback until every `useTranslation` call in
it is ready. Before, once the first call's namespaces loaded, the Suspense
replay handed its settled load to the next suspending read in the same
component: a second `useTranslation` rendered untranslated keys with
`ready: false`, and a following `use()` returned the wrong value. Each
`useTranslation` call site now keeps reading the load it suspended on, so each
following read suspends on its own data.
