---
'octane': patch
---

When hydration adopts an element whose children are all component calls but
the server rendered other content inside it, the first call now reports the
server node it found in place of its range once, the element's server children
are discarded, and the components are built inside the adopted element. A
single-root component used to compare its template with the element itself,
reporting that element, keeping the stale server children, and appending its
output after them; a lite component removed the adopted element entirely. Later
sibling calls in the same element no longer discard the rebuilt content of an
earlier one, and an element the server left empty reports "nothing".
