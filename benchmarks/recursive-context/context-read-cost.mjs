import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
// Observational allocation/CPU control, separate from the exact browser Map gate.
// Run: node --expose-gc --min-semi-space-size=256 --max-semi-space-size=256 benchmarks/recursive-context/context-read-cost.mjs
assert.equal(typeof global.gc, 'function', 'run with --expose-gc');
const repo = path.resolve(import.meta.dirname, '../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-context-reads-'));
const window = new Window();
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MouseEvent',
	'MutationObserver',
])
	globalThis[name] = name === 'window' ? window : window[name];
const fixture = path.join(scratch, 'fixture.mjs');
try {
	await build({
		stdin: {
			contents: `
import { createContext, useContext, createElement, createRoot, flushSync } from './packages/octane/src/index.ts';
export { createRoot, flushSync };
export function makeApp(count, rows) {
 const contexts=Array.from({length:count},()=>createContext(0));
 function Reader() {
  let text='';
  for(const context of contexts) text+=useContext(context)+',';
  return createElement('output', null, text);
 }
 function Rows() { return Array.from({length:rows},(_,key)=>createElement(Reader,{key})); }
 return function App(props) {
  let output=createElement(Rows,{});
  for(let i=contexts.length-1;i>=0;i--) output=createElement(contexts[i],{value:props.value,children:output});
  return output;
 };
}
`,
			resolveDir: repo,
		},
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'esnext',
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		outfile: fixture,
		logLevel: 'silent',
	});
	const { makeApp, createRoot, flushSync } = await import(pathToFileURL(fixture));
	const report = [];
	for (const count of [1, 2, 16, 64, 128]) {
		const rows = 256,
			App = makeApp(count, rows);
		const container = document.createElement('main');
		document.body.append(container);
		const root = createRoot(container);
		global.gc();
		const empty = process.memoryUsage().heapUsed;
		const render = (value) => flushSync(() => root.render(App, { value }));
		render(0);
		global.gc();
		const retained = process.memoryUsage().heapUsed - empty;
		const hosts = [...container.querySelectorAll('output')];
		for (let i = 1; i <= 12; i++) render(i);
		global.gc();
		const before = process.memoryUsage().heapUsed;
		const start = performance.now();
		for (let i = 13; i <= 32; i++) render(i);
		const ms = (performance.now() - start) / 20;
		const bytes = (process.memoryUsage().heapUsed - before) / 20;
		const after = [...container.querySelectorAll('output')];
		if (
			after.length !== rows ||
			after.some((node, i) => node !== hosts[i] || node.textContent !== '32,'.repeat(count))
		)
			throw Error('context value or identity failed');
		report.push({
			contexts: count,
			rows,
			retainedBytes: retained,
			updateBytes: bytes,
			updateMs: ms,
		});
		root.unmount();
		container.remove();
		await new Promise((resolve) => setImmediate(resolve));
	}
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
