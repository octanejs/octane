---
'octane': patch
---

Stop shipping form-action submission and Fragment refs to applications whose element descriptors cannot use them. Any renderable hole, such as a bare `{value}`, `{children}` or JSX stored in a variable, reaches the generic child renderer. That renderer used to keep the form submit driver (and through it the transition engine) and the `FragmentInstance` class in every such bundle, about 6.4 kB gzip. These now ship only when something can need them: the public `createElement`, `createElementAt` and `cloneElement` install both. Compiled JSX installs form actions when a host or dynamic tag has an `action`/`formAction` prop or a spread, and Fragment refs when a Fragment or dynamic tag has a `ref` or a spread.
