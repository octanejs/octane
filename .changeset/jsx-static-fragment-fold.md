---
'octane': patch
---

Render private static JSX components through their compiled fragment again.

A private `.tsx`/`.jsx` component whose body returns only static JSX, and
whose every use is an attribute-free child of a returned host element, again
renders through that parent's template as a lite component call. Since async
signals, component descriptors carry their invocation site, and the proof
recognized only the older descriptor call. Every such component therefore fell
back to a full component slot plus a descriptor child slot. On the
signal-favoring chain, the JSX twin's shallow bump went from 10 full component
slots to 100.
