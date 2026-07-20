// Every curated playground example must actually work in the playground:
// compile warning-free through the REAL pipeline (octane compiler / sucrase +
// specifier rewriting + ordering) and survive the share-hash round trip. This
// is the gate that keeps the dropdown honest as the compiler and examples
// evolve.
import { describe, it, expect } from 'vitest';
import {
	EXAMPLES,
	DEFAULT_EXAMPLE_ID,
	DEFAULT_WORKSPACES,
	exampleWorkspace,
	getExample,
} from '../src/lib/playground-examples.ts';
import { buildModuleGraph } from '../src/lib/playground-modules.ts';
import { decodePlaygroundHash, encodePlaygroundHash } from '../src/lib/playground-hash.ts';
import type { PlaygroundLang } from '../src/lib/playground.ts';

const CASES = EXAMPLES.flatMap((example) =>
	(Object.keys(example.variants) as PlaygroundLang[]).map((lang) => ({
		id: example.id,
		lang,
		workspace: example.variants[lang]!,
	})),
);

describe('curated examples', () => {
	it('exposes the counter example as the default workspace for both dialects', () => {
		const counter = getExample(DEFAULT_EXAMPLE_ID);
		expect(counter).toBeTruthy();
		expect(DEFAULT_WORKSPACES.tsrx.files[0].source).toContain('@for');
		expect(DEFAULT_WORKSPACES.tsx.files[0].source).toContain('items.map');
	});

	it('deep-copies workspaces so edits never mutate the catalogue', () => {
		const example = getExample(DEFAULT_EXAMPLE_ID)!;
		const workspace = exampleWorkspace(example, 'tsrx')!;
		workspace.files[0].source = 'mutated';
		expect(example.variants.tsrx!.files[0].source).not.toBe('mutated');
	});

	it.for(CASES)('$id [$lang] compiles warning-free through the real pipeline', async (testCase) => {
		const graph = await buildModuleGraph(testCase.workspace.files, testCase.workspace.entry);
		expect(graph).toMatchObject({ ok: true });
		if (!graph.ok) return;
		expect(graph.warnings).toEqual([]);
		expect(graph.modules.length).toBe(testCase.workspace.files.length);
		// React-host entries mount through react-dom; everything else through octane.
		expect(graph.entryKind).toBe(
			testCase.workspace.entry.endsWith('.react.tsx') ? 'react' : 'octane',
		);
	});

	it.for(CASES)('$id [$lang] survives the share-hash round trip', (testCase) => {
		const payload = {
			lang: testCase.lang,
			entry: testCase.workspace.entry,
			files: testCase.workspace.files,
		};
		const decoded = decodePlaygroundHash(encodePlaygroundHash(payload));
		expect(decoded).toEqual({ ok: true, value: payload });
	});
});
