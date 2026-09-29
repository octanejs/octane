---
'octane': patch
---

Keyed `@for` rows now reorder and remove correctly when a row's only element is
not built from the template. That covers a `<noscript>`, a tree the HTML parser
would repair (such as a `<div>` inside a `<p>`), a `<meta>` or other element
hoisted into the document head, and an element with its own `key` inside an
`@if` or `@switch` arm. It also covers components whose root is one of these.
Octane used to treat such a row as its single element, so removing rows could
leave elements or comment markers behind, reorders could misplace rows, and a
hoisted row could crash the list. Server-rendered keyed and `<noscript>` rows
now hydrate by adopting the server elements too.
