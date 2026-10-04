// Vendors react-router's framework-agnostic core into packages/remix-router/src.
//
// react-router v8 ships as a single package whose `./internal` subpath is
// types-only, so the router core (lib/router/* + the framework-free lib
// helpers) cannot be consumed as a dependency — it is copied here byte-close
// from the pinned tag. Upstream's `lib/**` layout is mirrored under `src/lib/**`
// so every relative import survives unchanged and upgrade diffs are mechanical:
// bump TAG, re-run `node scripts/vendor-remix-router.mjs`, review the diff.
//
// Exactly THREE categories of deviations are applied (each noted in the file
// header):
//   1. lib/router/utils.ts: React types are pointed at the local shim, the
//      three route-component descriptor creations use octane's createElement,
//      and the build-time __DEV__ constant becomes a NODE_ENV check.
//   2. lib/router/instrumentation.ts: its type-only RequestHandler import is
//      pointed at the local server-runtime-types stub. The framework request
//      handler itself remains out of scope.
//   3. Unused declarations that fail a consumer's noUnusedLocals or
//      noUnusedParameters. The package publishes this source, so a consumer's
//      compiler checks it under the consumer's own flags
//      (scripts/check-source-publication.mjs enforces this). Type-level test
//      aliases and the import only they read are removed, unused parameters are
//      `_`-prefixed, unread private fields become protected, and one dead
//      local is removed. Only that removal changes emitted code: the local
//      copied `opts.future` into an object that nothing reads.
//
// NEVER hand-edit vendored files beyond these deviations.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TAG = 'react-router@8.2.0';
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

// Category 3: one of upstream's type-level test tuples, from its lint
// suppression through the closing bracket. Nothing references the alias; it
// exists only so upstream's own typecheck evaluates the assertions inside it.
const typeLevelTests = (name) =>
	new RegExp(
		`\\n(?:// prettier-ignore\\n)?// eslint-disable-next-line @typescript-eslint/no-unused-vars\\n` +
			`type ${name} = \\[\\n[\\s\\S]*?\\n\\];?\\n`,
	);

// path → [pattern (a string or RegExp that must match exactly once), replacement, deviation note]
const DEVIATIONS = {
	'lib/router/utils.ts': [
		[
			'import * as React from "react";',
			'import type * as React from "../react-types";\nimport { createElement } from "octane";',
			'React types → local ../react-types shim; route descriptors → octane createElement',
		],
		['React.createElement(route.Component)', 'createElement(route.Component)'],
		['React.createElement(route.HydrateFallback)', 'createElement(route.HydrateFallback)'],
		['React.createElement(route.ErrorBoundary)', 'createElement(route.ErrorBoundary)'],
		[
			'// Provided by the build system\ndeclare const __DEV__: boolean;\nexport const ENABLE_DEV_WARNINGS = __DEV__;',
			'// The consumer\'s bundler substitutes the whole `process.env.NODE_ENV` expression\n// below, so it must stay written out literally. Declared module-locally — never\n// `declare global`, which would ship in the tarball — so this file type-checks in\n// a browser app that has no `@types/node`.\ndeclare const process: { env: { NODE_ENV?: string } };\nexport const ENABLE_DEV_WARNINGS = process.env.NODE_ENV !== "production";',
			'build-time __DEV__ constant → NODE_ENV check',
		],
		[
			'import type { Equal, Expect } from "../types/utils";\n',
			'',
			'type-level _tests alias and its Equal/Expect import → removed (consumer noUnusedLocals)',
		],
		[typeLevelTests('_tests'), ''],
		[
			'  private error?: Error;\n  private internal: boolean;',
			'  protected error?: Error;\n  protected internal: boolean;',
			'unread private error/internal fields → protected (consumer noUnusedLocals)',
		],
	],
	'lib/router/router.ts': [
		[
			'  // Currently unused in the static handler, but available for additional flags in the future\n' +
				'  // eslint-disable-next-line @typescript-eslint/no-unused-vars\n' +
				'  let future: FutureConfig = {\n    ...opts?.future,\n  };\n',
			'',
			'unread static-handler future local → removed (consumer noUnusedLocals)',
		],
		[
			'newRoute.children?.every((aChild, i) =>',
			'newRoute.children?.every((aChild, _i) =>',
			'unused parameters i/message → `_`-prefixed (consumer noUnusedParameters)',
		],
		['    type,\n    message,\n  }: {', '    type,\n    message: _message,\n  }: {'],
	],
	'lib/router/history.ts': [
		[
			'function createBrowserHref(window: Window, to: To)',
			'function createBrowserHref(_window: Window, to: To)',
			'unused createBrowserHref parameter window → `_`-prefixed (consumer noUnusedParameters)',
		],
	],
	'lib/router/instrumentation.ts': [
		[
			'import type { RequestHandler } from "../server-runtime/server";',
			'import type { RequestHandler } from "./server-runtime-types";',
			'type-only ../server-runtime/server import → local ./server-runtime-types stub',
		],
	],
	'lib/types/utils.ts': [
		[typeLevelTests('__tests'), '', 'type-level __tests alias → removed (consumer noUnusedLocals)'],
	],
};

for (const file of FILES) {
	const res = await fetch(BASE + file);
	if (!res.ok) throw new Error(`fetch failed (${res.status}): ${file}`);
	let code = await res.text();
	const notes = [];
	for (const [pattern, replacement, note] of DEVIATIONS[file] ?? []) {
		const matches =
			typeof pattern === 'string'
				? code.split(pattern).length - 1
				: (code.match(new RegExp(pattern, 'g')) ?? []).length;
		if (matches !== 1) {
			throw new Error(`deviation pattern matched ${matches} times in ${file}: ${note ?? pattern}`);
		}
		code = code.replace(pattern, () => replacement);
		if (note) notes.push(note);
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
