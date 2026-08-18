# Upstream provenance

`@octanejs/colorful` is an Octane adaptation of
[`react-colorful@5.8.0`](https://github.com/omgovich/react-colorful/tree/v5.8.0).

- npm version: `5.8.0`
- npm integrity: `sha512-Wy9OzPfjSN9bF12OB8N7UQvlsZ0I+7wHxpN+bV5BjNQGxOj6IiwkRjevJK9yOBjJWGQvAaf1OXtn8rUeEatAng==`
- npm shasum: `9bc89aac3e8c847b503489614e2d28227b36641f`
- repository tag: `v5.8.0`
- repository commit: `d914e7647c40a8bbdb286985176e769d76061732`
- license: MIT
- React oracle: `react@19.2.7` / `react-dom@19.2.7` with `@types/react@19.2.17` / `@types/react-dom@19.2.3` via the dedicated `react-colorful-react-oracle` pnpm catalog (exact pins; not `catalog:default`)

The byte-preserved tag sources and tests live under `upstream/tag`; the
published declaration and package authorities live under `upstream/npm`.
Neither directory is included in the published package.

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `tag/tests/components.test.js` (35 cases) | **ported** one-for-one titles → `tests/upstream/components.test.ts` | adapted-octane lane |
| `tag/tests/utils.test.js` (27 cases) | **ported** one-for-one titles → `tests/upstream/utils.test.ts` | adapted-octane lane |
| `tag/tests/csp.test.js` (1 case) | **ported** → `tests/upstream/csp.test.ts` | adapted-octane lane |
| `tag/tests/shadowDom.test.js` (1 case) | **ported** → `tests/upstream/shadowDom.test.ts` | adapted-octane lane |
| Octane source + adapted probe | **adapted types** via `typetests/tsconfig.adapted.json` | adapted-types lane |

### Port-authored classifications

| File | Classification |
| --- | --- |
| `tests/upstream/**` | adapted-upstream-suite |
| `typetests/public-api.test.ts` | adapted-upstream-suite |
| `tests/runtime/exports.test.ts` | octane-only-framework-contract |
| `tests/runtime/owner-document.test.ts` | octane-only-framework-contract |
| `tests/hydration/**` | octane-only-framework-contract |
| `tests/ssr/**` | octane-only-framework-contract |
| `tests/browser/**` | octane-only-framework-contract |
| `tests/differential/**` | react-octane-differential |
