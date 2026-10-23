---
'octane': minor
---

Support Trusted Types, as in React 19.3. A `TrustedHTML`, `TrustedScript`, or
`TrustedScriptURL` passed to `dangerouslySetInnerHTML` or an attribute such as
`srcdoc` or a script's `src` now reaches the DOM as the object instead of its
string. That lets these values work under an enforced
`require-trusted-types-for 'script'` CSP.

Octane parses its own compiled templates, binding fragments, and streamed
regions through a policy named `octane`. The streaming bootstrap uses one named
`octane-stream`. A CSP that restricts policy names with `trusted-types` must
allow both. Application strings never go through either policy.
