// `@octane-ts/zustand/middleware` — re-exported verbatim from zustand.
//
// Every zustand middleware (persist, devtools, subscribeWithSelector, combine,
// redux, createJSONStorage, …) is a framework-agnostic store enhancer of the form
// `(set, get, api) => state` — it operates purely on the vanilla store and imports
// NO React. So it composes with octane's `create`/`useStore` unchanged, and we
// re-export it as-is (mirroring src/vanilla.ts).
export * from 'zustand/middleware';
