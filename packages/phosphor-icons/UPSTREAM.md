# Phosphor Icons upstream contract

The React oracle is `@phosphor-icons/react@2.1.10` at commit
`57424d5f99b793b585f5c6f5cab76f79772510e5`; its npm archive SHA-256 is
`08027417baf5fc4818581a63c487c98ad36c80c17816a0069d4fd0805350ee90`.
Generated geometry is pinned separately to MIT-licensed
`@phosphor-icons/core@2.1.1`.

The generator covers all 1,512 canonical icons, deprecated aliases, and six
weights. Refs and events follow Octane's native contracts, and the React-only
SSR namespace is unnecessary. Existing exhaustive generation/export and SSR
tests remain package evidence. Upstream keeps a runtime suite under `test/` and
has no dedicated type-test suite. The manifest's same-fixture lane is bounded to
accessible duotone Camera SVG output and remains `recorded-unverified` because
that pristine upstream runtime suite is not vendored one-for-one.
