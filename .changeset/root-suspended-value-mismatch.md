---
'octane': patch
---

Keep server text and style values in place while a root without a Suspense
boundary is suspended during hydration, and report their mismatches once when
it commits. A first attempt that repaired a value and then suspended used to
show the client's text or style in the server's markup while the root was
pending, and the attempt that committed found the text already matching, so a
text mismatch never reached `onRecoverableError` and development builds logged
no warning. Attribute, class, style, and `dangerouslySetInnerHTML` warnings now
wait for the committing attempt instead of logging once per attempt. When a
suspended root render, including a client update, rolls back after removing a
namespaced attribute such as `xlink:href`, the attribute now comes back in its
namespace.
