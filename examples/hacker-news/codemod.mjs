// The codemod lane: the React-style app, spelled with React's imports, migrated
// to TSRX by @octanejs/codemod. The shared Playwright spec runs against the
// result next to the hand-written jsx and tsrx apps, so passing it proves the
// migration kept the app's behavior.
//
//   node codemod.mjs   -> writes codemod/ (gitignored) from jsx/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCodemod } from '@octanejs/codemod';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'codemod');

// How a React app imports what jsx/ imports from Octane. Only APIs React spells
// the same way move; ErrorBoundary, octane/static's prerender, and StyleX have
// no same-API React counterpart and stay on Octane, as in a partly migrated app.
/** @type {Record<string, string | Record<string, string>>} */
const REACT_SPELLING = {
	octane: {
		Suspense: 'react',
		useDeferredValue: 'react',
		createRoot: 'react-dom/client',
		hydrateRoot: 'react-dom/client',
		ErrorBoundary: 'octane',
	},
	'@octanejs/tanstack-query': '@tanstack/react-query',
	'@octanejs/tanstack-router': '@tanstack/react-router',
};

/**
 * @param {string} text
 * @param {string} file
 */
function asReact(text, file) {
	return text.replace(/^import \{([^}]*)\} from '([^']+)';$/gm, (statement, list, module) => {
		const target = REACT_SPELLING[module];
		if (target === undefined) return statement;
		if (typeof target === 'string') return `import {${list}} from '${target}';`;
		/** @type {Map<string, string[]>} */
		const groups = new Map();
		for (const name of list
			.split(',')
			.map((/** @type {string} */ n) => n.trim())
			.filter(Boolean)) {
			const to = target[name];
			if (!to) throw new Error(`${file}: no React spelling for \`${name}\` from '${module}'.`);
			groups.set(to, [...(groups.get(to) ?? []), name]);
		}
		return [...groups]
			.map(([to, names]) => `import { ${names.join(', ')} } from '${to}';`)
			.join('\n');
	});
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'jsx'), out, { recursive: true });
for (const name of fs.readdirSync(out)) {
	if (!/\.tsx?$/.test(name) || name.endsWith('.config.ts')) continue;
	const file = path.join(out, name);
	fs.writeFileSync(file, asReact(fs.readFileSync(file, 'utf8'), name));
}

const result = await runCodemod([out], { root });
const problems = result.files.flatMap((file) =>
	[...file.notes, ...file.diagnostics]
		.filter((finding) => finding.severity === 'error')
		.map((finding) => `${file.output}:${finding.line} ${finding.message}`),
);
for (const file of result.files) {
	const code = fs.readFileSync(path.join(root, file.output), 'utf8');
	if (/from '(?:react|react-dom(?:\/[^']*)?|@tanstack\/react-[^']+)'/.test(code)) {
		problems.push(`${file.output}: still imports React`);
	}
}
if (problems.length > 0) {
	console.error(`codemod: the migration left errors:\n${problems.join('\n')}`);
	process.exit(1);
}
const migrated = result.files.filter((file) => file.changed);
const templates = migrated.filter((file) => file.output.endsWith('.tsrx'));
console.log(
	`codemod: migrated ${migrated.length} module(s), ${templates.length} to .tsrx, into codemod/`,
);
