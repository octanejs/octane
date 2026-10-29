---
'octane': patch
---

The `.tsrx` type view that the editor and `octane-tsc` check accepts two shapes that already compiled. A one-parameter generic arrow, `<T,>(x: T) => x`, stays generic instead of reading as a JSX element `T` (TS17008). A directive arm that ends early with `return;`, `return null;`, or a `continue;` no inner loop owns no longer reports TSRX2005, TSRX2002 or TSRX2007, and the rest of the arm is checked with the exit's narrowing, so `if (!row.user) continue;` leaves `row.user` defined. A value return such as `return 1;` is still reported, as compiling rejects it.
