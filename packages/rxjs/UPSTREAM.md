# React-RxJS upstream contract

The primary source pin is `@react-rxjs/core@0.10.8`, commit
`330f4c329f635c577e39655bd46c0d80a13f3a41` in
`re-rxjs/react-rxjs`, with npm archive SHA-256
`f1311219e6503a768463a4319b9fc264438c62b774b9ef81feaa21085edfd65a`.
The utilities surface tracks `@react-rxjs/utils@0.9.7`, released by commit
`cf794f35dc50143ffd04a971560719b549b54eaa` in the same MIT repository.

The Octane binding ports the core bind/state/Subscribe APIs and the public
utilities surface. `@react-rxjs/dom` is intentionally omitted because Octane
batches without ReactDOM's batching helper. State values render through
`useStateObservable` or `bind`, rather than being JSX nodes.

The tagged upstream runtime and type suites are present but have not been
vendored or adapted one-for-one. The manifest therefore remains
`recorded-unverified`; its bounded differential lane proves only `bind`'s
initial snapshot and later-emission rendering through one shared fixture.
Until provenance is verified, that lane stays outside `testExecution` so
ordinary sharded CI executes it (`react-parity:check` only validates the
manifest while verification is `recorded-unverified`).
