# Packed consumer contract

The package-local artifact probe remains at `../probes/packed-exports.test.mjs`
because it is part of the immutable U5 evidence set. It checks the tarball's
conditions, public namespace, authored-source publication, `./package.json`, and
absence of React leakage. The repository-wide external-consumer gate in
`scripts/check-package-packs.mjs` installs the packed binding alongside packed
Octane, renders it in client and server builds, checks its peer-runtime identity,
and resolves `attr-accept` and `file-selector` from the installed entry.
