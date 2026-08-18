# Runtime adaptation assertions

The crosswalk reads both sources. For every `it` / expanded `it.each` title it
compares ordered `expect(...)` chains and `dispatchEvent` interactions, and
checks each adapted `// Per upstream/src/…:<line>` citation points at the
matching pristine case. Inventory `fullName` matching alone is not enough.

Permitted differences, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import roots / Testing Library | package under test |
| 2 | `React.createElement` / `Fragment` / `createRef` → Octane equivalents | renderable runtime |
| 3 | arrow callbacks ↔ `function` form (including `unregisterCalls.some`) | style-only |
| 4 | `it.each(entries)` → one `it` per entry with `firstStatement(path)` | Node resolution of package entries |
| 5 | BubbleMenu synthetic-event expects → native-event expects | `tiptap-native-menu-events` ledger |
