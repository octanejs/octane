---
'octane': patch
---

Keep plain function overload signatures non-ambient in the virtual TSX.

esrap before 2.3.2 printed `declare` on every bodyless function declaration, so
a plain overload pair next to its implementation typechecked as TS2384
("Overload signatures must all be ambient or non-ambient") in the editor and
under `tsrx-tsc`, on source that compiles and runs fine. The dependency floor
now requires the fixed printer; an authored ambient `declare function` keeps
its modifier.
