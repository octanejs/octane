// @vitest-environment node
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

async function consume(source: string, dev = false, strong = false, target = 'esnext') {
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
			target,
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

describe('same-file production hydration roots', () => {
	it.each([false, true])(
		'adopts nodes while preserving state, drafts and body/options evaluation (Strong: %s)',
		async (strong) => {
			const source = `import {hydrateRoot as adopt,useId,useState,useLayoutEffect} from 'octane';
let evaluations=[],cleanups=0;
function View(props) @{ const id=useId(); const [count,update]=useState(0); useLayoutEffect(()=>()=>{cleanups++});
 <main><button id={id} onClick={()=>update(count+1)}>{props.label + ':' + count as string}</button><input defaultValue="initial" /></main> }
export async function run(){const host=document.querySelector('#host');
 host.innerHTML='<main><button id=":adopt-in-3:">server:0</button><input value="initial"></main>';
 const main=host.firstElementChild,button=host.querySelector('button'),input=host.querySelector('input');input.value='typed';input.focus();input.setSelectionRange(1,3);
 const target=()=>{evaluations.push('target');return host};const props=()=>{evaluations.push('props');return {label:'server'}};
 const options=()=>{evaluations.push('options');return {identifierPrefix:'adopt-',identifierSeed:3}};
 const root=adopt(target(),View,props(),options());const adopted=main===host.firstElementChild;
 button.click();await Promise.resolve();const clicked=button.textContent;
 root.render(View,{label:'client'});await Promise.resolve();
 const result={adopted,clicked,updated:button.textContent,same:button===host.querySelector('button')&&input===host.querySelector('input'),value:input.value,
 focused:document.activeElement===input,selection:[input.selectionStart,input.selectionEnd],id:button.id,evaluations};
 root.unmount();return {...result,cleanups,cleaned:host.childNodes.length===0};}`;
			for (const dev of [false, true])
				expect(await consume(source, dev, strong)).toEqual({
					adopted: true,
					clicked: 'server:1',
					updated: 'client:1',
					same: true,
					value: 'typed',
					focused: true,
					selection: [1, 3],
					id: ':adopt-in-3:',
					evaluations: ['target', 'props', 'options'],
					cleanups: 1,
					cleaned: true,
				});
		},
	);

	it('discovers late opaque handles on adopted text and controls without replacing drafts', async () => {
		const source = `import {hydrateRoot,flushSync} from 'octane';
function View(props) @{ <main><span>{props.value as string}</span><input value={props.value}/><textarea /></main> }
export async function run(){const host=document.querySelector('#host');host.innerHTML='<main><span>ordinary</span><input value="ordinary"><textarea></textarea></main>';
 const span=host.querySelector('span'),input=host.querySelector('input'),spare=host.querySelector('textarea');spare.value='draft';
 const root=hydrateRoot(host,View,{value:'ordinary'});const adopted=span===host.querySelector('span');
 const {createScope}=await import('octane/signals');const scope=createScope({scopeKey:'late-hydrated-root'}),value=scope.signal$('value','first');
 root.render(View,{value});await Promise.resolve();const before=span.textContent;flushSync(()=>value.set('second'));
 const result={adopted,before,after:span.textContent,inputValue:input.value,same:input===host.querySelector('input'),draft:spare.value};
 root.unmount();value.set('disposed');scope.dispose();return {...result,cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				adopted: true,
				before: 'first',
				after: 'second',
				inputValue: 'second',
				same: true,
				draft: 'draft',
				cleaned: true,
			});
	});

	it.each(['retry', 'replace', 'unmount'])(
		'preserves initial suspension adoption and cleanup across %s',
		async (operation) => {
			const source = `import {hydrateRoot,createRoot,flushSync,useId,useLayoutEffect} from 'octane';
let effects=0,cleanups=0,refs=[];
function View(props) @{ useLayoutEffect(()=>{effects++;return()=>{cleanups++}},[]);if(!props.ready.value)throw props.gate;const id=useId();
 <main><button id={id} ref={node=>refs.push(node?'attach':'detach')}>{props.label as string}</button><input defaultValue="initial" /></main> }
export async function run(){const host=document.querySelector('#host');host.innerHTML='<main><button id=":pending-in-2:">server</button><input value="initial"></main>';
 const main=host.firstElementChild,input=host.querySelector('input');input.value='typed';let release;const gate=new Promise(resolve=>release=resolve),ready={value:false};
 const root=hydrateRoot(host,View,{ready,gate,label:'server'},{identifierPrefix:'pending-',identifierSeed:2});
 const pending={text:host.textContent,same:main===host.firstElementChild,effects,refs:[...refs]};
 ${operation === 'replace' ? "root.render(View,{ready:{value:true},gate:null,label:'replacement'});flushSync(()=>{});" : operation === 'unmount' ? 'root.unmount();' : ''}
 ready.value=true;release();await Promise.resolve();await Promise.resolve();flushSync(()=>{});
 const result={pending,text:host.textContent,adopted:main===host.firstElementChild,value:host.querySelector('input')?.value??null,id:host.querySelector('button')?.id??null,effects,refs:[...refs]};
 ${operation === 'unmount' ? "const next=createRoot(host);next.render(()=>'new root');const reclaimed=host.textContent;next.unmount();return {...result,reclaimed,cleanups,cleaned:host.childNodes.length===0};" : 'root.unmount();return {...result,cleanups,finalRefs:refs,cleaned:host.childNodes.length===0};'} }`;
			for (const dev of [false, true]) {
				const pending = { text: 'server', same: true, effects: 0, refs: [] };
				expect(await consume(source, dev)).toEqual(
					operation === 'unmount'
						? {
								pending,
								text: '',
								adopted: false,
								value: null,
								id: null,
								effects: 0,
								refs: [],
								reclaimed: 'new root',
								cleanups: 0,
								cleaned: true,
							}
						: {
								pending,
								text: operation === 'replace' ? 'replacement' : 'server',
								adopted: operation === 'retry',
								value: operation === 'retry' ? 'typed' : 'initial',
								id: ':pending-in-2:',
								effects: 1,
								refs: ['attach'],
								cleanups: 1,
								finalRefs: ['attach', 'detach'],
								cleaned: true,
							},
				);
			}
		},
	);

	it('recovers mismatched hosts and reports the error while leaving native events live', async () => {
		const source = `import {hydrateRoot,useState} from 'octane';
function View() @{ const [count,update]=useState(0); <main><button onClick={()=>update(count+1)}>{String(count) as string}</button></main> }
export async function run(){const host=document.querySelector('#host');host.innerHTML='<aside><b>stale</b></aside>';const stale=host.firstElementChild;let errors=0;
 const root=hydrateRoot(host,View,undefined,{onRecoverableError(){errors++}});await Promise.resolve();
 host.querySelector('button').click();await Promise.resolve();const result={text:host.textContent,replaced:stale!==host.firstElementChild,errors};root.unmount();return {...result,cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				text: '1',
				replaced: true,
				errors: 1,
				cleaned: true,
			});
	});

	it('retains generic returned output during initial suspended adoption retries', async () => {
		const source = `import {hydrateRoot,flushSync} from 'octane';
let ready=false,release;const gate=new Promise(resolve=>release=resolve);
function Returned(){if(!ready)throw gate;return 'returned';}
export async function run(){const host=document.querySelector('#host');host.textContent='server';const root=hydrateRoot(host,Returned);
 const pending=host.textContent;ready=true;release();await Promise.resolve();await Promise.resolve();flushSync(()=>{});const text=host.textContent;root.unmount();return {pending,text,cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				pending: 'server',
				text: 'returned',
				cleaned: true,
			});
	});

	it.each([
		`const root=hydrateRoot(host,()=> 'ordinary');const initial=host.textContent;root.render(View,{label:'later'});`,
		`const root=hydrateRoot(host,<View label="server" key="one"/>,{identifierPrefix:'descriptor-'});root.render(()=>'ordinary');`,
		`const root=hydrateRoot(host,View,{label:'server'});root.render(()=>'ordinary');`,
		`const root=hydrateRoot(host,View,{label:'server'});const alias=root;alias.render(()=>'ordinary');`,
	])('retains the generic ABI for initial or later unproved output', async (body) => {
		const source = `import {hydrateRoot,flushSync} from 'octane';
function View(props) @{<main>{props.label as string}</main>}
export function run(){const host=document.querySelector('#host');host.innerHTML='<main>server</main>';${body}flushSync(()=>{});const text=host.textContent;root.unmount();return {text,${body.includes('const initial') ? 'initial,' : ''}cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				...(body.includes('const initial') ? { initial: 'ordinary' } : {}),
				text: body.includes("label:'later'") ? 'later' : 'ordinary',
				cleaned: true,
			});
	});
});

describe('void-root proof boundaries shared by create and hydrate', () => {
	it.each(['createRoot(host)', 'hydrateRoot(host,View,{label:"server"})'])(
		'preserves roots escaped through a supported class decorator: %s',
		async (factory) => {
			const source = `import {createRoot,hydrateRoot,flushSync} from 'octane';let saved;
function capture(root){saved=root;return value=>value;}function View(props) @{<main>{props?.label??'server' as string}</main>}
export function run(){const host=document.querySelector('#host');host.innerHTML='<main>server</main>';const root=${factory};${factory.startsWith('create') ? 'root.render(View,{label:"server"});' : ''}
 @capture(root) class Holder{} saved.render(()=>'ordinary');flushSync(()=>{});const text=host.textContent;root.unmount();return {text,cleaned:host.childNodes.length===0};}`;
			for (const dev of [false, true])
				expect(await consume(source, dev, false, 'es2022')).toEqual({
					text: 'ordinary',
					cleaned: true,
				});
		},
	);
	it('keeps descriptor keys and options in their public argument positions', async () => {
		const source = `import {hydrateRoot,flushSync,useId,useState} from 'octane';let evaluations=[];
function View(props) @{const id=useId();const [count,update]=useState(0);<main><button id={id} onClick={()=>update(count+1)}>{props.label+':'+count as string}</button><input /></main>}
export function run(){const host=document.querySelector('#host');host.innerHTML='<main><button id=":descriptor-in-4:">server:0</button><input></main>';
 const first=host.firstElementChild,input=host.querySelector('input');input.value='typed';
 const descriptor=()=>{evaluations.push('descriptor');return <View label="server" key="one"/>};
 const options=()=>{evaluations.push('options');return {get identifierPrefix(){evaluations.push('prefix');return 'descriptor-';},identifierSeed:4}};
 const root=hydrateRoot(host,descriptor(),options());const adopted=first===host.firstElementChild,id=host.querySelector('button').id;flushSync(()=>host.querySelector('button').click());
 root.render(<View label="updated" key="one"/>);flushSync(()=>{});const before={text:host.textContent,same:first===host.firstElementChild,draft:host.querySelector('input').value};
 root.render(<View label="replacement" key="two"/>);flushSync(()=>{});const after={text:host.textContent,replaced:first!==host.firstElementChild,draft:host.querySelector('input').value};
 root.unmount();return {adopted,id,evaluations,before,after,cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				adopted: true,
				id: ':descriptor-in-4:',
				evaluations: ['descriptor', 'options', 'prefix', 'prefix'],
				before: { text: 'updated:1', same: true, draft: 'typed' },
				after: { text: 'replacement:0', replaced: true, draft: '' },
				cleaned: true,
			});
	});
	it('preserves an authored hydration-helper-like binding', async () => {
		const source = `import {hydrateRoot} from 'octane';const _$__hydrateVoidRoot='authored';function View(props) @{<main>{props.label as string}</main>}
export function run(){const host=document.querySelector('#host');host.innerHTML='<main>authored</main>';const root=hydrateRoot(host,View,{label:_$__hydrateVoidRoot});const text=host.textContent;root.unmount();return {text,cleaned:host.childNodes.length===0};}`;
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'authored', cleaned: true });
	});
});

describe('chained, module-scope and element-form void roots', () => {
	const specialized = (source: string) =>
		compile(source, 'consumer.tsrx', { dev: false, hmr: false }).code;

	it('renders a chained element target with its props and live defaultProps', async () => {
		const source = `import {createRoot} from 'octane';
function View(props) @{ <main>{props.label + ':' + String(props.flag) + ':' + props.extra as string}</main> }
View.defaultProps = { extra: 'default', label: 'unused' };
const label = 'first';
createRoot(document.querySelector('#host')).render(<View label={label} flag />);
export function run() { const host=document.querySelector('#host'); return {text:host.textContent}; }`;
		const code = specialized(source);
		expect(code).toContain('__createVoidRoot as');
		expect(code).toContain('__voidRootProps as');
		expect(code).not.toContain('createElementFromConfig');
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'first:true:default' });
	});

	it('keeps a __proto__ attribute on the element path', async () => {
		const source = `import {createRoot} from 'octane';
function View(props) @{ <main>{String(Object.hasOwn(props, '__proto__')) + ':' + String(props.inherited) as string}</main> }
const base = { inherited: 'leaked' };
createRoot(document.querySelector('#host')).render(<View __proto__={base} />);
export function run() { return {text: document.querySelector('#host').textContent}; }`;
		expect(specialized(source)).toContain('createElementFromConfig');
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({ text: 'false:undefined' });
	});

	it('keeps keys, children and effectful values on the element path', async () => {
		const source = `import {createRoot,flushSync} from 'octane';
function View(props) @{ <main>{props.label as string}<input /></main> }
const order = [];
const compute = () => { order.push('props'); return 'dynamic'; };
const host = document.querySelector('#host');
const root = createRoot(host);
root.render(<View label={compute()} />);
flushSync(() => {});
const input = host.querySelector('input'); input.value = 'typed';
root.render(<View key="one" label="keyed" />);
flushSync(() => {});
const keyed = { text: host.textContent, replaced: input !== host.querySelector('input') };
root.render(<View key="one" label="same" />);
flushSync(() => {});
const same = { text: host.textContent, retained: host.querySelector('input').value === '' };
root.unmount();
const cleaned = host.childNodes.length === 0;
export function run() { return {order, keyed, same, cleaned}; }`;
		const code = specialized(source);
		// A module-private root with only proven uses is a closed lifetime.
		expect(code).toContain('__createVoidRoot as');
		expect(code.match(/createElementFromConfig\(/g)).toHaveLength(3);
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				order: ['props'],
				keyed: { text: 'keyed', replaced: true },
				same: { text: 'same', retained: true },
				cleaned: true,
			});
	});

	it('hydrates a chained element target by adopting server nodes', async () => {
		const source = `import {hydrateRoot} from 'octane';
function View(props) @{ <main><span>{props.label as string}</span><input /></main> }
const host = document.querySelector('#host');
host.innerHTML = '<main><span>server</span><input></main>';
const main = host.firstElementChild;
host.querySelector('input').value = 'typed';
hydrateRoot(host, <View label="server" />).render(<View label="client" />);
const adopted = main === host.firstElementChild;
export async function run() { await Promise.resolve();
 return {adopted, text: host.textContent, draft: host.querySelector('input').value}; }`;
		const code = specialized(source);
		expect(code).toContain('__hydrateVoidRoot as');
		expect(code).not.toContain('createElementFromConfig');
		for (const dev of [false, true])
			expect(await consume(source, dev)).toEqual({
				adopted: true,
				text: 'client',
				draft: 'typed',
			});
	});

	it.each([
		['exported', 'export const root=createRoot(host); root.render(View,{label:"first"});'],
		[
			'closure',
			'const root=createRoot(host); root.render(View,{label:"first"}); export const later=()=>root;',
		],
		['non-render member', 'const root=createRoot(host).render; void root;'],
		['host tag', 'createRoot(host).render(<main>first</main>);'],
		[
			'returned-value target',
			'function Plain() { return "first"; } createRoot(host).render(<Plain />);',
		],
		[
			'eval-reachable named',
			'const root=createRoot(host); root.render(View,{label:"first"}); eval("root");',
		],
	])('leaves %s roots generic', (_label, body) => {
		const code = specialized(
			`import {createRoot} from 'octane';\nfunction View(props) @{ <main>{props.label as string}</main> }\nconst host=document.body;\n${body}`,
		);
		expect(code).not.toContain('__createVoidRoot');
	});

	it('keeps an unnamed chained root of an import specialized beside direct eval', () => {
		// Strict module eval cannot create a binding and nothing names this root,
		// but it can still reassign a same-file function declaration.
		const entry = (component: string) =>
			compile(
				`import {createRoot} from 'octane';\n${component}\ncreateRoot(document.body).render(<View />);\neval('1');`,
				'consumer.tsrx',
				{ dev: false, hmr: false, isVoidComponentImport: () => true },
			).code;
		expect(entry("import View from './View.tsrx';")).toContain('__createVoidRoot as');
		expect(entry('function View() @{ <main>first</main> }')).not.toContain('__createVoidRoot');
	});
});
