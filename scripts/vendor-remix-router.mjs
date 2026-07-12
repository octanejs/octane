// Vendors react-router's framework-agnostic core into packages/remix-router/src.
//
// react-router v7 ships as a single package whose `./internal` subpath is
// types-only, so the router core (lib/router/* + the framework-free lib
// helpers) cannot be consumed as a dependency — it is copied here byte-close
// from the pinned tag. Upstream's `lib/**` layout is mirrored under `src/lib/**`
// so every relative import survives unchanged and upgrade diffs are mechanical:
// bump TAG, re-run `node scripts/vendor-remix-router.mjs`, review the diff.
//
// Exactly TWO deviations are applied (each noted in the file header):
//   1. lib/router/utils.ts: the type-only `react` import is pointed at the
//      local `../react-types` shim (consumers of this package don't have
//      @types/react; the shim aliases the handful of referenced types).
//   2. lib/router/instrumentation.ts: two type-only `../server-runtime/*`
//      imports are pointed at the local `./server-runtime-types` stub (the
//      server runtime is out of scope; only two type names are referenced).
//
// NEVER hand-edit vendored files beyond these deviations.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TAG = 'react-router@7.18.1';
const BASE = `https://raw.githubusercontent.com/remix-run/react-router/${encodeURIComponent(TAG)}/packages/react-router/`;
const DEST = join(import.meta.dirname, '../packages/remix-router/src');

const FILES = [
	'lib/router/url.ts',
	'lib/router/history.ts',
	'lib/router/utils.ts',
	'lib/router/router.ts',
	'lib/router/instrumentation.ts',
	'lib/router/links.ts',
	'lib/errors.ts',
	'lib/href.ts',
	'lib/actions.ts',
	'lib/dom/dom.ts',
	'lib/types/future.ts',
	'lib/types/utils.ts',
	'lib/types/register.ts',
	'lib/types/params.ts',
	'lib/types/route-module.ts',
	// Server runtime — the framework-independent cookie/session surface
	// (createCookie/createSession/…). server.ts (createRequestHandler) is NOT
	// vendored: it is framework-mode (needs a @react-router/dev ServerBuild)
	// and is exported as a throwing stub instead.
	'lib/server-runtime/cookies.ts',
	'lib/server-runtime/crypto.ts',
	'lib/server-runtime/sessions.ts',
	'lib/server-runtime/sessions/cookieStorage.ts',
	'lib/server-runtime/sessions/memoryStorage.ts',
	'lib/server-runtime/warnings.ts',
	'lib/server-runtime/mode.ts',
];

// path → [pattern, replacement, deviation note]
const DEVIATIONS = {
	'lib/router/utils.ts': [
		[
			'import type * as React from "react";',
			'import type * as React from "../react-types";',
			'type-only react import → local ../react-types shim',
		],
	],
	'lib/router/instrumentation.ts': [
		[
			'import type { AppLoadContext } from "../server-runtime/data";\nimport type { RequestHandler } from "../server-runtime/server";',
			'import type { AppLoadContext, RequestHandler } from "./server-runtime-types";',
			'type-only ../server-runtime/* imports → local ./server-runtime-types stub',
		],
	],
};

for (const file of FILES) {
	const res = await fetch(BASE + file);
	if (!res.ok) throw new Error(`fetch failed (${res.status}): ${file}`);
	let code = await res.text();
	const notes = [];
	for (const [pattern, replacement, note] of DEVIATIONS[file] ?? []) {
		if (!code.includes(pattern)) throw new Error(`deviation pattern missing in ${file}: ${note}`);
		code = code.replace(pattern, replacement);
		notes.push(note);
	}
	const header =
		`// Vendored from ${TAG} packages/react-router/${file} — unmodified` +
		(notes.length ? ` except: ${notes.join('; ')}.` : '.') +
		`\n// Re-vendor with \`node scripts/vendor-remix-router.mjs\`; never hand-edit.\n`;
	const out = join(DEST, file);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, header + code);
	console.log(`vendored ${file}${notes.length ? ' (with deviations)' : ''}`);
}
console.log(`done — ${FILES.length} files at ${TAG}`);
