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
import { compilePlayground } from '../src/lib/playground.ts';
import { decodePlaygroundHash, encodePlaygroundHash } from '../src/lib/playground-hash.ts';
import type { PlaygroundLang } from '../src/lib/playground.ts';

const CASES = EXAMPLES.flatMap((example) =>
	(Object.keys(example.variants) as PlaygroundLang[]).map((lang) => ({
		id: example.id,
		lang,
		workspace: example.variants[lang]!,
	})),
);

// Every `.tsrx` file of every workspace, for the scoped-style gate below.
const TSRX_FILES = CASES.flatMap((testCase) =>
	testCase.workspace.files
		.filter((file) => file.name.endsWith('.tsrx'))
		.map((file) => ({
			id: testCase.id,
			lang: testCase.lang,
			name: file.name,
			source: file.source,
		})),
);

/** The CSS of every `injectStyle(hash, css)` call in compiled output. */
function injectedCss(code: string): string[] {
	return [...code.matchAll(/injectStyle\("tsrx-[a-z0-9]+",\s*"((?:[^"\\]|\\.)*)"/g)].map(
		(match) => JSON.parse('"' + match[1] + '"') as string,
	);
}

/** Class names that appear as `.name` selectors in the file's `<style>` blocks. */
function styledClasses(source: string): Set<string> {
	const names = new Set<string>();
	for (const block of source.matchAll(/<style[^>]*>([^]*?)<\/style>/g)) {
		for (const selector of block[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) names.add(selector[1]);
	}
	return names;
}

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

	// A `<style>` block styles the other children of the list it sits in and
	// their descendants, never the element that contains it and never a child
	// component's elements. Both mistakes are silent in the playground: the
	// compiler keeps a selector that reaches nothing only as an
	// `/* (unused) … */` comment, and an element whose rule lives in another
	// component's scope renders unstyled. Gate both, on the client and the
	// server compile alike.
	it.for(TSRX_FILES)(
		'$id [$lang] $name scopes every style rule to an element it reaches',
		({ source, name }) => {
			const targeted = styledClasses(source);
			for (const mode of ['client', 'server'] as const) {
				const out = compilePlayground(source, name, mode);
				expect(out).toMatchObject({ ok: true });
				if (!out.ok) return;
				for (const css of injectedCss(out.code)) {
					expect(css, `${mode}: a rule reaches no element`).not.toContain('(unused)');
				}
				// Every authored class a block targets must be stamped with a scope
				// hash in the compiled markup, i.e. sit inside a scope that styles it.
				for (const literal of source.matchAll(/class="([^"]+)"/g)) {
					for (const cls of literal[1].split(/\s+/)) {
						if (!targeted.has(cls)) continue;
						const stamped = new RegExp(`class=\\\\?"(?:[^"]* )?${cls}(?: [^"]*)? tsrx-[a-z0-9]+`);
						expect(out.code, `${mode}: class "${cls}" carries no scope hash`).toMatch(stamped);
					}
				}
			}
		},
	);

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
