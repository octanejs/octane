---
'octane': patch
---

Keep every root of a hydrating `@if` or `@switch` branch that the server rendered no range for. Such a branch adopts the server nodes at the cursor in place, and hydration bounded its content after the first root it adopted. When the branch was the whole content of another arm or of a component the client adopted, the rules that remove the server's leftover content then deleted the branch's later roots, which the client still renders, and reported a mismatch for them. A branch that was not deleted from still owned only its first root, so switching it off left the others on screen. The branch now ends after all the roots its template adopted. The server content after them is still removed and reported once, and a branch whose roots outnumber what the server rendered there is built on the client and reported, instead of hydrating without its later roots. This also covers a branch inside a component that was adopted in place.
