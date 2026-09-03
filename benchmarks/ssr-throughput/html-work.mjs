// Observe a copy of the clean production bundle after compiler optimization
// and tree-shaking. This copy is never used for timing or byte measurements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const COUNTER_NAME = 'octane.benchmark.ssrHtmlCalls';
const COUNTER = Symbol.for(COUNTER_NAME);

export async function createHtmlWorkObserver(entry) {
	const { parseModule } = await import('../../packages/octane/src/compiler/parser.node.js');
	const source = fs.readFileSync(entry, 'utf8');
	const ast = parseModule(source, entry);
	// The fixtures use an unminified, self-contained production bundle. Observe
	// the runtime's HTML factory, not generated item-helper aliases or call sites.
	const factories = ast.body.filter(
		(node) => node.type === 'FunctionDeclaration' && node.id?.name === 'ssrHtml',
	);
	assert.equal(factories.length, 1, 'expected one bundled server HTML factory');
	const insertion = factories[0].body.start + 1;
	const observedSource =
		source.slice(0, insertion) +
		`\nglobalThis[Symbol.for(${JSON.stringify(COUNTER_NAME)})]++;\n` +
		source.slice(insertion);
	const observedEntry = path.join(path.dirname(entry), `.html-work-${randomUUID()}.mjs`);
	const previousCounter = Object.getOwnPropertyDescriptor(globalThis, COUNTER);
	Object.defineProperty(globalThis, COUNTER, { configurable: true, writable: true, value: 0 });
	const dispose = () => {
		fs.rmSync(observedEntry, { force: true });
		if (previousCounter) Object.defineProperty(globalThis, COUNTER, previousCounter);
		else delete globalThis[COUNTER];
	};

	try {
		fs.writeFileSync(observedEntry, observedSource);
		const observed = await import(pathToFileURL(observedEntry).href);
		return {
			async measure(clean, renderName) {
				const expected = await clean[renderName]();
				globalThis[COUNTER] = 0;
				const actual = await observed[renderName]();
				const htmlFactoryCalls = globalThis[COUNTER];
				assert.deepEqual(actual, expected, `${renderName}: HTML observer changed the response`);
				return { htmlFactoryCalls };
			},
			dispose,
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
