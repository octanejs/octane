import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build, parseAst, type Rolldown } from 'vite';
import { octane } from 'octane/compiler/vite';
import {
	resolveDeclarationRanges,
	retainedDeclarations,
} from '../../../benchmarks/bundle-size/hydration-free-gates.mjs';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';

// Optional capabilities install a module-level driver or stage when an
// application first uses them. Vite's default production build drops what those
// variables guard from an application that never uses the capability, but only
// while the runtime reads each one in a form its minifier can fold (see the
// driver declarations in runtime.ts). The oracle is the bundle's source map: a
// declaration is retained exactly when some generated code maps into it.
const SOURCE = resolve(import.meta.dirname, '../src');
const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const OPTIONAL_DECLARATIONS = [
	// ViewTransition's staged DOM and the drivers that prepare a staged commit.
	'STAGED_DOM',
	'VIEW_TRANSITION_DRIVER',
	'DEFERRED_LAYOUT_DRIVER',
	'STAGED_COMMIT_CAPTURE',
	// Suspense and Activity visibility, and effect reconnection on reveal.
	'SCHEDULED_VISIBILITY_DRIVER',
	'activityRefState',
	'EFFECT_RECONNECT_CONTEXT',
	// Signals read natively by compiled components, and a renderer path behind it.
	'NATIVE_READ_DRIVER',
	'beginActiveNativeReadScope',
];
const ranges = resolveDeclarationRanges(
	(source: string) => readFileSync(join(SOURCE, source), 'utf8'),
	(text: string, source: string) => parseAst(text, { lang: 'ts' }, source),
	OPTIONAL_DECLARATIONS.map((name) => ({ name, source: 'runtime.ts' })),
);

const PLAIN_APP = `import { createRoot, flushSync, useState } from 'octane';

function Row(props) @{
	<li ref={props.onRef}>{props.label as string}</li>
}

function List(props) @{
	const [items, setItems] = useState(props.items);
	<div>
		<button onClick={() => setItems([...items].reverse())}>{'reverse'}</button>
		<ul>@for (const item of items; key item) { <Row label={item} onRef={props.onRef} /> }</ul>
	</div>
}

export function run(container) {
	const refs = [];
	const root = createRoot(container);
	const onRef = (el) => {
		if (el !== null) refs.push(el.textContent);
	};
	flushSync(() => root.render(List, { items: ['a', 'b', 'c'], onRef }));
	const before = container.textContent;
	flushSync(() => container.querySelector('button').click());
	const after = container.textContent;
	root.unmount();
	return { before, after, refs, empty: container.childNodes.length === 0 };
}
`;

const CAPABILITIES_APP = `import { Activity, Suspense, ViewTransition, createRoot, flushSync } from 'octane';
import { signal$ } from 'octane/signals';

const count$ = signal$(0);

function Counter() @{
	<button onClick={() => count$.set(count$.get() + 1)}>{String(count$.get()) as string}</button>
}

function App() @{
	<ViewTransition>
		<Suspense fallback={<p>{'loading'}</p>}>
			<Activity mode="visible"><Counter /></Activity>
		</Suspense>
	</ViewTransition>
}

export function run(container) {
	const root = createRoot(container);
	flushSync(() => root.render(App));
	const before = container.textContent;
	flushSync(() => container.querySelector('button').click());
	const after = container.textContent;
	root.unmount();
	return { before, after, empty: container.childNodes.length === 0 };
}
`;

const roots: string[] = [];
afterAll(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// An ordinary production build of the application: Vite's default minifier,
// with the runtime bundled from source the way a consumer compiles it.
async function buildApp(source: string) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-optional-drivers-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(PACKAGE_ROOT, join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(join(root, 'App.tsrx'), source);
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		mode: 'production',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			sourcemap: true,
			target: 'esnext',
			lib: { entry: join(root, 'App.tsrx'), formats: ['es'] },
		},
	});
	const output = (Array.isArray(result) ? result : [result]).flatMap((item) => {
		if (!('output' in item)) throw new Error('Expected a one-shot Vite build.');
		return item.output;
	});
	const chunks = output.filter((item): item is Rolldown.OutputChunk => item.type === 'chunk');
	expect(chunks).toHaveLength(1);
	const [chunk] = chunks;
	if (chunk.map === null) throw new Error('Expected a source map.');
	return { retained: retainedDeclarations(chunk.map, ranges), chunk };
}

// The bundle carries its own runtime, so it imports nothing from the test's.
function run(chunk: Rolldown.OutputChunk) {
	const app = evaluateCompiledFixtureCode(chunk.code, chunk.fileName, 'client', undefined);
	const container = document.createElement('div');
	document.body.append(container);
	try {
		return app.run(container);
	} finally {
		container.remove();
	}
}

describe('optional capability drivers in production bundles', { timeout: 60_000 }, () => {
	it('ships none of their code in an application that uses none of them', async () => {
		const { retained, chunk } = await buildApp(PLAIN_APP);
		expect(OPTIONAL_DECLARATIONS.filter((name) => retained.has(name))).toEqual([]);
		expect(run(chunk)).toEqual({
			before: 'reverseabc',
			after: 'reversecba',
			refs: ['a', 'b', 'c'],
			empty: true,
		});
	});

	it('keeps each driver in an application that uses its capability', async () => {
		const { retained, chunk } = await buildApp(CAPABILITIES_APP);
		expect(OPTIONAL_DECLARATIONS.filter((name) => !retained.has(name))).toEqual([]);
		expect(run(chunk)).toEqual({ before: '0', after: '1', empty: true });
	});
});
