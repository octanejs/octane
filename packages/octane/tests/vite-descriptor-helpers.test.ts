// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { populateGlobal } from 'vitest/environments';
import {
	build,
	createRunnableDevEnvironment,
	createServer,
	type RunnableDevEnvironment,
} from 'vite';
import { octane } from 'octane/compiler/vite';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const files = {
	'helper.ts': `import { createElement } from 'octane';
import { Row } from './rows.tsrx';
import { select } from './events.js';
export function buildRows(items: any[]) {
 const out = new Array(items.length);
 for (let i = 0; i < items.length; i++) {
  const item = items[i];
  out[i] = createElement(Row, { key: item.id, id: item.id, label: item.label, wall: 'row', onSelect: select });
 }
 return out;
}`,
	'rows.tsrx': `import { memo } from 'octane';
function View(props) @{ <article><button onClick={() => props.onSelect(props.id, props.label)}>{(props.wall+':'+props.label) as string}</button><input defaultValue="initial" /></article> }
export const Row = memo(View);`,
};

function fixture(overrides: Record<string, string>) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-descriptor-helper-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(resolve(import.meta.dirname, '..'), join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	for (const [name, source] of Object.entries({ ...files, ...overrides })) {
		mkdirSync(dirname(join(root, name)), { recursive: true });
		writeFileSync(join(root, name), source);
	}
	return root;
}

async function consume(overrides: Record<string, string> = {}) {
	const root = fixture(overrides);
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		plugins: [octane({ hmr: false })],
		build: {
			write: false,
			minify: false,
			lib: { entry: join(root, 'entry.ts'), formats: ['iife'], name: 'fixture' },
		},
	});
	const output = (Array.isArray(result) ? result : [result]).flatMap((item) => {
		if (!('output' in item)) throw new Error('Expected a one-shot build.');
		return item.output;
	});
	const chunk = output.find((item) => item.type === 'chunk');
	if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a bundled fixture.');
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	try {
		window.eval(chunk.code);
		return JSON.parse(JSON.stringify((window as any).fixture.run()));
	} finally {
		window.close();
	}
}

// Same client-consumer dev environment as vite-dev-profile-guards.test.ts.
// This executes Vite's actual serve transforms; it is not a production build
// relabelled by changing NODE_ENV.
async function consumeDevelopment(overrides: Record<string, string>) {
	const root = fixture(overrides);
	const viteClient = realpathSync(
		resolve(dirname(fileURLToPath(import.meta.resolve('vite'))), '../client/client.mjs'),
	);
	const window = new Window();
	const { keys, originals } = populateGlobal(globalThis, window, { bindFunctions: true });
	const globals = globalThis as typeof globalThis & { __OCTANE_PROFILE_ENABLED__?: boolean };
	const previousProfile = globals.__OCTANE_PROFILE_ENABLED__;
	globals.__OCTANE_PROFILE_ENABLED__ = false;
	let server: Awaited<ReturnType<typeof createServer>> | undefined;
	try {
		server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			plugins: [
				octane(),
				{
					// RunnableDevEnvironment has no browser WebSocket transport. Keep
					// Octane's dev/HMR compilation, but do not connect Vite's unused
					// browser HMR client in this render-only control.
					name: 'render-only-dev-hmr-transport',
					enforce: 'pre',
					load(id) {
						if (id === viteClient) return 'export const createHotContext = () => undefined;';
					},
				},
			],
			optimizeDeps: { noDiscovery: true, include: [] },
			server: {
				middlewareMode: true,
				hmr: false,
				ws: false,
				watch: null,
				fs: { allow: [root, realpathSync(resolve(import.meta.dirname, '..'))] },
			},
			environments: {
				app: {
					consumer: 'client',
					resolve: { noExternal: true },
					dev: {
						moduleRunnerTransform: true,
						createEnvironment: (name, config) =>
							createRunnableDevEnvironment(name, config, { hot: false }),
					},
				},
			},
		});
		const environment = server.environments.app as RunnableDevEnvironment;
		const app = await environment.runner.import('/entry.ts');
		return JSON.parse(JSON.stringify(app.run()));
	} finally {
		await server?.close();
		window.close();
		for (const key of keys) delete (globalThis as any)[key];
		for (const [key, value] of originals) (globalThis as any)[key] = value;
		if (previousProfile === undefined) delete globals.__OCTANE_PROFILE_ENABLED__;
		else globals.__OCTANE_PROFILE_ENABLED__ = previousProfile;
	}
}

// A new outer array must not hide authored reads of a retained row object.
// These controls deliberately share the same helper, Row and public actions.
describe('mutated item render parity', { timeout: 60_000 }, () => {
	it.each(['production TSRX', 'development TSRX', 'production JSX', 'forwarded TSRX'] as const)(
		'keeps current fields and factory inputs in %s',
		async (mode) => {
			const jsx = mode === 'production JSX';
			const appFile = jsx ? 'App.tsx' : 'App.tsrx';
			const helper = mode === 'forwarded TSRX' ? './forward.ts' : './helper.ts';
			const setup = `import { useState } from 'octane';
import { buildRows } from '${helper}';
export let update;
`;
			const body = `const [items, setItems] = useState(props.items); update = setItems;
const rows = buildRows(items);`;
			const overrides = {
				[appFile]: jsx
					? `/** @jsxImportSource octane */\n${setup}export function App(props) { ${body} return <main>{rows}</main>; }`
					: `${setup}export function App(props) @{ ${body} <main>{rows}</main> }`,
				'forward.ts': `import { buildRows as original } from './helper.ts'; export function buildRows(items) { return original(items); }`,
				'events.js': `export const events = []; export const reads = [];
export let select = (id, label) => events.push(['initial', id, label]);
export function changeSelect() { select = (id, label) => events.push(['later', id, label]); }
export function reset() { events.length = 0; reads.length = 0; select = (id, label) => events.push(['initial', id, label]); }`,
				'entry.ts': `import { createRoot, flushSync } from 'octane';
import { App, update } from './${appFile}';
import { Row } from './rows.tsrx';
import { events, reads, changeSelect, reset } from './events.js';
export function run() {
 const results = [];
 for (const scenario of ['field mutation', 'getter changes import', 'transient defaults']) {
  reset();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const a = {id: 1, label: scenario === 'transient defaults' ? undefined : 'A'};
  const b = {id: 2, label: 'B'};
  const items = [a,b];
  try {
   root.render(App, {items}); flushSync(()=>{});
   const before = [...host.querySelectorAll('article')];
   const input = before[1].querySelector('input'); input.value = 'typed';
   if (scenario === 'field mutation') b.label = 'changed';
   else if (scenario === 'getter changes import') Object.defineProperty(b, 'label', {
    configurable: true, get() { reads.push('label'); changeSelect(); return 'changed'; }
   });
   else {
    Object.defineProperty(a, 'label', { configurable: true, get() {
     reads.push('a-label'); Row.type.defaultProps = {label:'defaulted'}; return undefined;
    }});
    Object.defineProperty(b, 'label', { configurable: true, get() {
     reads.push('b-label'); delete Row.type.defaultProps; return 'B';
    }});
   }
   flushSync(()=>update(items.slice()));
   const after = [...host.querySelectorAll('article')];
   host.querySelectorAll('button')[scenario === 'transient defaults' ? 0 : 1].click();
   flushSync(()=>{});
   const result = { scenario, text: host.textContent, reads: [...reads], events: events.map(value=>[...value]),
    identity: after.length === 2 && after.every((row,index)=>row===before[index]),
    inputIdentity: after[1].querySelector('input') === input, draft: input.value };
   root.unmount(); results.push({...result, empty:host.childNodes.length===0});
  } finally { delete Row.type.defaultProps; root.unmount(); host.remove(); }
 }
 return results;
}`,
			};
			const behavior =
				mode === 'development TSRX'
					? await consumeDevelopment(overrides)
					: await consume(overrides);
			const retained = { identity: true, inputIdentity: true, draft: 'typed', empty: true };
			expect(behavior).toEqual([
				{
					scenario: 'field mutation',
					text: 'row:Arow:changed',
					reads: [],
					events: [['initial', 2, 'changed']],
					...retained,
				},
				{
					scenario: 'getter changes import',
					text: 'row:Arow:changed',
					reads: ['label'],
					events: [['later', 2, 'changed']],
					...retained,
				},
				{
					scenario: 'transient defaults',
					text: 'row:defaultedrow:B',
					reads: ['a-label', 'b-label'],
					events: [['initial', 1, 'defaulted']],
					...retained,
				},
			]);
		},
	);
});
