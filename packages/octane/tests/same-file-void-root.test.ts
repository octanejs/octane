// @vitest-environment node
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

async function consume(source: string, dev = false, strong = false) {
	const window = new Window({
		url: 'https://octane.test/',
		settings: { enableJavaScriptEvaluation: true },
	});
	window.document.body.innerHTML = '<div id="host"></div>';
	try {
		const result = await build({
			stdin: {
				contents: compile(source, 'consumer.tsrx', { dev, hmr: false, strong }).code,
				resolveDir: resolve(import.meta.dirname, '..'),
				loader: 'ts',
			},
			bundle: true,
			write: false,
			format: 'iife',
			globalName: 'consumer',
			platform: 'browser',
			target: 'esnext',
			logLevel: 'silent',
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
		});
		window.eval(result.outputFiles[0].text);
		return JSON.parse(JSON.stringify(await (window as any).consumer.run()));
	} finally {
		window.close();
	}
}

const IMPORTS = "import {createRoot, flushSync} from 'octane';\n";
const VIEW = 'function View(props) @{ <main>{props.label as string}<input /></main> }\n';

describe('same-file production roots', () => {
	it.each([false, true])(
		'preserves props, state, survivor identity and cleanup (Strong: %s)',
		async (strong) => {
			const source = `${strong ? IMPORTS.replace('createRoot, flushSync', 'createRoot') : IMPORTS} import {useState,useLayoutEffect} from 'octane';
let cleanups=0;
function View(props) @{
 const [count,update]=useState(0);
 useLayoutEffect(()=>()=>{cleanups++;});
 <main><button onClick={()=>update(count+1)}>{props.label as string}:{String(count) as string}</button><input /></main>
}
export async function run() {
 const host=document.querySelector('#host'); const root=createRoot(host);
 root.render(View,{label:'first'});
 const button=host.querySelector('button'), input=host.querySelector('input'); input.value='typed';
 button.click(); await Promise.resolve(); const clicked=button.textContent;
 root.render(View,{label:'second'}); await Promise.resolve(); const updated=button.textContent;
 const retained=button===host.querySelector('button') && input===host.querySelector('input') && input.value==='typed';
 root.unmount(); return {clicked,updated,retained,cleanups,cleaned:host.childNodes.length===0};
}`;
			for (const dev of [false, true])
				expect(await consume(source, dev, strong)).toEqual({
					clicked: 'first:1',
					updated: 'second:1',
					retained: true,
					cleanups: 1,
					cleaned: true,
				});
		},
	);

	it('preserves opaque forwarded signal props after a late engine import', async () => {
		const source = `${IMPORTS}
function View(props) @{ <main><span>{props.value as string}</span><input value={props.value} /><textarea /></main> }
export async function run() {
 const host=document.querySelector('#host'); const root=createRoot(host); root.render(View,{value:'ordinary'});
 const span=host.querySelector('span'), input=host.querySelector('input'), spare=host.querySelector('textarea'); spare.value='typed';
 const {createScope}=await import('octane/signals');
 const scope=createScope({scopeKey:'same-file-late'}), value=scope.signal$('value','first');
 root.render(View,{value}); await Promise.resolve(); const before=span.textContent;
 flushSync(()=>value.set('second')); const after=span.textContent;
 const inputValue=input.value, retained=span===host.querySelector('span') && input===host.querySelector('input') && spare.value==='typed';
 root.unmount(); value.set('disposed'); scope.dispose(); return {before,after,inputValue,retained,cleaned:host.childNodes.length===0};
}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				before: 'first',
				after: 'second',
				inputValue: 'second',
				retained: true,
				cleaned: true,
			});
	});

	it.each([
		`function mount(host) { const root=createRoot(host); root.render(View,{label:'first'}); return root; }
export function run() { const host=document.querySelector('#host'), root=mount(host); root.render('ordinary');
 const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
		`export function run() { const host=document.querySelector('#host'), root=createRoot(host); root.render(View,{label:'first'});
 root.render(()=>'ordinary'); const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
		`export function run() { const host=document.querySelector('#host'), root=createRoot(host); root.render(View,{label:'first'});
 eval("root.render('ordinary')"); const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
		`export function run() { const host=document.querySelector('#host'), root=createRoot(host); root.render(View,{label:'first'});
 function replace() { root.render('ordinary'); } replace(); const text=host.textContent;
 root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
		`namespace N { export const root=createRoot(document.querySelector('#host')); root.render(View,{label:'first'}); }
namespace N { export function replace() { N.root.render('ordinary'); } }
export function run() { N.replace(); const host=document.querySelector('#host'),text=host.textContent;
 N.root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`,
	])('retains ordinary returned output across unknown and escaping root uses', async (body) => {
		for (const dev of [false, true])
			expect(await consume(IMPORTS + VIEW + body, dev)).toEqual({
				text: 'ordinary',
				cleaned: true,
			});
	});

	it('rejects a writable component declaration throughout the retained root lifetime', async () => {
		const source = `${IMPORTS} const initial=View;
function View() @{ <main>first</main> }
function replace() { View=()=> 'ordinary'; }
export async function run() { const host=document.querySelector('#host'), root=createRoot(host); root.render(View);
 replace(); root.render(View); await Promise.resolve(); const text=host.textContent;
 root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'ordinary', cleaned: true });
	});

	it('resolves render targets by lexical binding rather than a same-name module component', async () => {
		const source = `${IMPORTS + VIEW}
function mount(host,View) { const root=createRoot(host); root.render(View); return host.textContent; }
export function run() { const host=document.querySelector('#host'); return {text:mount(host,()=> 'ordinary')}; }`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'ordinary' });
	});

	it('does not collide with an authored helper-like binding', async () => {
		const source = `${IMPORTS + VIEW}
const _$__createVoidRoot='authored';
export function run() { const host=document.querySelector('#host'),root=createRoot(host); root.render(View,{label:_$__createVoidRoot});
 const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`;
		expect(await consume(source)).toEqual({ text: 'authored', cleaned: true });
	});

	it('handles array holes and omitted destructuring bindings throughout the module', async () => {
		const source = `${IMPORTS + VIEW}
const [,label]=[, 'holes'];
export function run() { const host=document.querySelector('#host'),root=createRoot(host); root.render(View,{label});
 const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'holes', cleaned: true });
	});

	it('resolves the factory import through lexical shadows', async () => {
		const source = `import {createRoot as makeRoot} from 'octane'; ${VIEW}
function mount(host,makeRoot) { const root=makeRoot(host); root.render(View); root.unmount(); }
export function run() { let calls=0; mount(document.querySelector('#host'),()=>({render(){calls++;},unmount(){}})); return {calls}; }`;
		for (const dev of [false, true]) expect(await consume(source, dev)).toEqual({ calls: 1 });
	});

	it('retains ordinary setup return values inside shorthand components', async () => {
		const source = `${IMPORTS}
function View(props) @{ if(props.ordinary) return 'ordinary'; <main>template</main> }
export function run() { const host=document.querySelector('#host'),root=createRoot(host); root.render(View,{ordinary:true});
 const text=host.textContent; root.unmount(); return {text,cleaned:host.childNodes.length===0}; }`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'ordinary', cleaned: true });
	});
});
