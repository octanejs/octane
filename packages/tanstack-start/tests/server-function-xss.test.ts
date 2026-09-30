import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression guard for CVE-2026-102989 / GHSA-qx66-fv34-fjm8: a critical
// unauthenticated reflected XSS in TanStack Start's server-function response
// handling. `@octanejs/tanstack-start` does not fork that handler — it drives
// requests through `@tanstack/start-server-core` — so the fix is applied as a
// pnpm patch (patches/@tanstack__start-server-core@1.169.17.patch) that backports
// the upstream fix first released in start-server-core >= 1.169.39.
//
// SCOPE: the pnpm patch rewrites only the copy resolved inside this repository,
// so it protects the monorepo's own apps and CI. It does not ship in the
// published package; the consumer-facing fix is tracked separately. See the
// patchedDependencies comment in pnpm-workspace.yaml.
//
// `handleServerAction` is an internal module (not a public export) that resolves
// server functions through a compiler-generated virtual module, so it cannot be
// driven from a unit test. Instead this guards the security property on the
// dependency the repository resolves: client input is restricted to the public
// {data, context, method} fields, and a non-Response result is never returned as
// the raw HTTP response on the non-server-function path. The guard passes whether
// the fix comes from our patch or a future upstream version, and fails if the
// vulnerable behaviour is reintroduced (e.g. the patch stops applying).

const bindingPackageJson = join(process.cwd(), 'packages/tanstack-start/package.json');
const requireFromBinding = createRequire(bindingPackageJson);
const serverCorePackageJson = requireFromBinding.resolve(
	'@tanstack/start-server-core/package.json',
);
const handlerFile = join(dirname(serverCorePackageJson), 'dist/esm/server-functions-handler.js');
const handlerSource = readFileSync(handlerFile, 'utf8');

describe('TanStack Start server-function handler (CVE-2026-102989)', () => {
	it('restricts client-supplied input to the public {data, context, method} fields', () => {
		// The vulnerable handler spread the whole client payload into the server
		// function, letting attacker-controlled fields reach internal middleware
		// state. The fix constructs an explicit, restricted options object.
		expect(handlerSource).not.toMatch(/payload\.method\s*=\s*methodUpper/);
		expect(handlerSource).not.toMatch(/payload\.context\s*=\s*safeObjectMerge/);
		expect(handlerSource).toMatch(/data:\s*payload\?\.data/);
		expect(handlerSource).toMatch(/context:\s*safeObjectMerge\(payload\?\.context,\s*context\)/);
	});

	it('does not return a non-Response result as the raw HTTP response on the non-server-function path', () => {
		// The vulnerable handler returned `unwrapped` verbatim for any request
		// without the x-tsr-serverFn header, so an attacker-controlled
		// response-shaped object from the error path could be emitted as HTML
		// from the app's own origin. The fix only returns it raw when it is a
		// Response, null, or a primitive; objects fall through to safe
		// serialization.
		expect(handlerSource).not.toMatch(/if\s*\(\s*!isServerFn\s*\)\s*return unwrapped/);
		expect(handlerSource).toMatch(/typeof unwrapped\s*!==\s*['"]object['"]/);
	});
});
