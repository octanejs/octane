---
'octane': patch
---

Float precedence groups now form in tree discovery order on client mounts, and
head hoists computed from setup locals no longer crash SSR.

Precedence group order is CSS cascade order. Client mounts used to create
groups in the order component bodies finished executing — a nested child's or
`@try` arm's group could precede its parent's, so the same tree could cascade
differently on a client-only mount than on an SSR'd page. Resource
registrations now run after a component's setup but before its children mount,
so groups form parent-before-child, suspended arms at reveal, matching SSR and
React on both sides.

The server twin fixed a latent crash the same placement rule exposed: a hoisted
head element or resource whose attribute reads a setup local (for example
`<link href={slug} precedence …>` after `const slug = …`) used to emit its
registration ahead of the local's declaration and throw a TDZ ReferenceError
during render. Capture-free registrations still lead the body — arm-root sheets
keep shipping with the streaming shell — while ones that read setup locals now
run right after setup, still ahead of children.
