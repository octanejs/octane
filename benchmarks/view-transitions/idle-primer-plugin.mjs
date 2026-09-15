// Vite setup plugin. The authored fixture and compiler output are unchanged.
// Add before octane() in both baseline and candidate production builds.
// Requires the classic fixtures' existing target: 'esnext' for top-level await.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browserFile = path.join(here, 'idle-primer.js');
const browserSource = fs.readFileSync(browserFile, 'utf8');
const hash = (source) => createHash('sha256').update(source).digest('hex');

export function idleTransitionPrimer({ fixture, entry }) {
	const entryPath = path.resolve(fixture, entry);
	assert.ok(fs.existsSync(entryPath), `Missing fixture entry: ${entryPath}`);
	const bootstrapURL = '/@octane-vt-idle-bootstrap.js';
	const bootstrapID = '\0octane-vt-idle-bootstrap';
	const browserID = '\0octane-vt-idle-primer-browser';
	const fixtureID = 'virtual:octane-vt-idle-original-entry';
	let htmlEdits = 0;
	const bootstrap = `import { prepareIdleTransitionDriver } from 'virtual:octane-vt-idle-primer-browser';\nawait prepareIdleTransitionDriver();\nawait import('${fixtureID}');\n`;
	return {
		name: 'octane-vt-installed-idle-primer',
		enforce: 'pre',
		api: {
			fixtureEntry: entryPath,
			fixtureEntrySha256: hash(fs.readFileSync(entryPath)),
			primerSourceSha256: hash(browserSource),
			bootstrapSourceSha256: hash(bootstrap),
			modes: ['cold', 'idle'],
			query: 'vt-primer',
			observation: 'window.__vtIdlePrimer',
		},
		resolveId(id) {
			if (id === bootstrapURL) return bootstrapID;
			if (id === 'virtual:octane-vt-idle-primer-browser') return browserID;
			if (id === fixtureID) return entryPath;
		},
		load(id) {
			if (id === bootstrapID) return bootstrap;
			if (id === browserID) return browserSource;
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				const scripts = [
					...html.matchAll(
						/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>\s*<\/script>/g,
					),
				];
				assert.equal(scripts.length, 1, 'Expected exactly one external module fixture entry');
				const script = scripts[0];
				const resolved = path.resolve(fixture, script[2].replace(/^\//, ''));
				assert.equal(resolved, entryPath, `Unexpected HTML entry ${script[2]}`);
				htmlEdits++;
				return html.replace(script[0], script[0].replace(script[2], bootstrapURL));
			},
		},
		generateBundle() {
			assert.equal(htmlEdits, 1, 'The primer must replace exactly one HTML module entry');
		},
	};
}
