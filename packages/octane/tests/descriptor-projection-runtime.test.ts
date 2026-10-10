// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';

// The real adapter owns admission. Ordinary helper calls and the server build
// retain the authored factory; these consumers exercise the admitted DOM path.
const files = {
	'helper.ts': `import { createElement } from 'octane';
import { Row } from './rows.tsrx';
import { onPick } from './events.ts';
export function buildRows(items: any[]) {
 const out = new Array(items.length);
 for (let i = 0; i < items.length; i++) {
  const item = items[i];
  out[i] = createElement(Row, { key: item.id, id: item.id, projectionText: item.label, value: item.value, wait: item.wait, onPick });
 }
 return out;
}`,
	'events.ts': `export const lifecycle: string[] = [];
export let onPick = (_id: string, _label: string) => {};
export function setOnPick(next: typeof onPick) { onPick = next; }
export let onRender = (_id: string) => {};
export function setOnRender(next: typeof onRender) { onRender = next; }`,
	'rows.tsrx': `import { createContext, memo, use, useContext, useLayoutEffect, useState } from 'octane';
import { lifecycle, onRender } from './events.ts';
export const Theme = createContext('initial');
function View(props) @{
 onRender(props.id);
 const theme = useContext(Theme);
 const [count, setCount] = useState(0);
 useLayoutEffect(() => { lifecycle.push('connect:'+props.id); return () => { lifecycle.push('disconnect:'+props.id); }; }, []);
 if (props.wait !== undefined) use(props.wait);
 <article data-row={props.id}>
  <input defaultValue="draft" onInput={() => setCount(count + 1)} />
  <button onClick={() => props.onPick(props.id, props.projectionText)}>{props.projectionText as string}</button>
  <b>{props.value as string}</b><output>{theme as string}</output><small>{count as string}</small>
 </article>
}
export const Row = memo(View);`,
	'App.tsrx': `import { Activity, descriptorChildren, useState } from 'octane';
import { buildRows } from './helper.ts';
import { Theme } from './rows.tsrx';
export function Rows(props) @{ const rows = buildRows(props.items); <section>{rows}</section> }
export function BeforeRows(props) @{ const rows = buildRows(props.items); props.before(); <section>{rows}</section> }
export function App(props) @{ <main><Theme value={props.theme}><Rows items={props.items} /></Theme></main> }
export function TransitionRows(props) @{
 const [items, setItems] = useState(props.items);
 props.bind(setItems);
 const rows = buildRows(items);
 <Theme value={props.theme}><section>{rows}</section></Theme>
}
export function Retained(props) @{
 const rows = buildRows(props.items);
 <Activity mode={props.visible ? 'visible' : 'hidden'}><Theme value={props.theme}><section>{rows}</section></Theme></Activity>
}
let inspected;
export function readInspection() { return inspected; }
function InspectBody(props) { inspected = props.children; return props.children; }
const Inspect = descriptorChildren(InspectBody);
export function Inspected(props) @{ const rows = buildRows(props.items); <Inspect>{rows}</Inspect> }
export function Boundary(props) @{
 @try { <App items={props.items} theme={props.theme} /> }
 @catch (error) { <output data-error>{error.message as string}</output> }
}`,
	'entry.ts': `export { App, Rows, BeforeRows, TransitionRows, Boundary, Retained, Inspected, readInspection } from './App.tsrx';
export { Row } from './rows.tsrx';
export { setOnPick, setOnRender, lifecycle } from './events.ts';
export { buildRows } from './helper.ts';
export { createRoot, hydrateRoot, flushSync, act, startTransition } from 'octane';`,
	'entry.server.ts': `export { App } from './App.tsrx'; export { renderToString } from 'octane/server';`,
};

let root: string;
let clientCode: string;
let server: { App: unknown; renderToString: (...args: any[]) => { html: string } };

beforeAll(async () => {
	root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-descriptor-runtime-')));
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(resolve(import.meta.dirname, '..'), join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
	for (const ssr of [false, true]) {
		const result = await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [octane({ hmr: false })],
			define: { 'process.env.NODE_ENV': '"production"' },
			ssr: { noExternal: true },
			build: {
				write: false,
				minify: false,
				...(ssr
					? { ssr: join(root, 'entry.server.ts') }
					: {
							lib: { entry: join(root, 'entry.ts'), formats: ['iife' as const], name: 'fixture' },
						}),
			},
		});
		const outputs = Array.isArray(result) ? result : [result];
		const chunks = outputs.flatMap((output) => ('output' in output ? output.output : []));
		const chunk = chunks.find((item) => item.type === 'chunk');
		if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a bundled fixture.');
		if (ssr)
			server = await import(
				`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
			);
		else clientCode = chunk.code;
	}
}, 60_000);

afterAll(() => {
	if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

async function observe(source: string, html = '') {
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	Object.assign(window, { MessageChannel: globalThis.MessageChannel });
	try {
		window.document.body.innerHTML = `<div id="host">${html}</div>`;
		window.eval(clientCode);
		const result = await window.eval(`(async () => {
 const {App, Rows, BeforeRows, TransitionRows, Boundary, Retained, Inspected, readInspection, Row, setOnPick, setOnRender, lifecycle, buildRows, createRoot, hydrateRoot, flushSync, act, startTransition} = fixture;
 const host = document.querySelector('#host');
 ${source}
})()`);
		return JSON.parse(JSON.stringify(result));
	} finally {
		window.close();
	}
}

describe('descriptor projection runtime fallbacks', () => {
	it('keeps keyed state when an urgent update supersedes a suspended reordered transition', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, c={id:'c',label:'C',value:3}, root=createRoot(host);
 let update;root.render(TransitionRows,{items:[a,b,c],theme:'one',bind:next=>{update=next;}});await act(()=>{});
 const first=[...host.querySelectorAll('article')], input=first[0].querySelector('input');input.value='typed';
 await act(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 let resolve;const wait=new Promise(done=>{resolve=done;});let attempted=false;
 setOnRender(id=>{if(id==='c')attempted=true;});
 await act(()=>startTransition(()=>update([b,a,{...c,wait}])));
 const heldNodes=[...host.querySelectorAll('article')];
 const held=heldNodes.length===first.length&&heldNodes.every((node,index)=>node===first[index]);
 await act(()=>update([a,b,c]));
 const after=[...host.querySelectorAll('article')];
 const accepted={identity:after.length===first.length&&after.every((node,index)=>node===first[index]),labels:[...host.querySelectorAll('button')].map(node=>node.textContent),state:[...host.querySelectorAll('small')].map(node=>node.textContent),input:input.value};
 await act(()=>resolve('ready'));
 const staleNodes=[...host.querySelectorAll('article')];
 const stale=staleNodes.length===first.length&&staleNodes.every((node,index)=>node===first[index]);
 root.unmount();return {attempted,held,accepted,stale};`),
		).toEqual({
			attempted: true,
			held: true,
			accepted: { identity: true, labels: ['A', 'B', 'C'], state: ['1', '0', '0'], input: 'typed' },
			stale: true,
		});
	});

	it('observes key conversion installed after the helper returns', async () => {
		expect(
			await observe(`
 const a={id:'key:a',label:'A',value:1}, b={id:'key:b',label:'B',value:2}, root=createRoot(host), string=String;
 const before=()=>{ globalThis.String=new Proxy(string,{apply(target,receiver,args){
  if(args[0]==='key:b') throw new Error('application key conversion');
  return Reflect.apply(target,receiver,args);
 }}); };
 root.render(BeforeRows,{items:[a,b],before:()=>{}});flushSync(()=>{});
 let error;
 try { flushSync(()=>root.render(BeforeRows,{items:[b,a],before})); }
 catch(failure) { error=failure.message; }
 finally { globalThis.String=string; }
 flushSync(()=>root.render(BeforeRows,{items:[a,b],before:()=>{}}));
 const result={error,labels:[...host.querySelectorAll('button')].map(node=>node.textContent)};
 root.unmount();return result;`),
		).toEqual({ error: 'application key conversion', labels: ['A', 'B'] });
	});

	it('keeps survivor state across key replacement, shrinking, and appending', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, c={id:'c',label:'C',value:3}, root=createRoot(host);
 root.render(App,{items:[a,b,c],theme:'one'});flushSync(()=>{});
 const first=[...host.querySelectorAll('article')], input=first[1].querySelector('input');input.value='typed';
 flushSync(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 flushSync(()=>root.render(App,{items:[a,b],theme:'two'}));
 const shrunk=[...host.querySelectorAll('article')];
 const replacement={...a,id:'replacement',label:'new'};
 flushSync(()=>root.render(App,{items:[replacement,b,c],theme:'three'}));
 const grown=[...host.querySelectorAll('article')];
 const result={shrunk:shrunk.length===2&&shrunk[0]===first[0]&&shrunk[1]===first[1],replacement:grown[0]!==first[0],survivor:grown[1]===first[1],remount:grown[2]!==first[2],labels:[...host.querySelectorAll('button')].map(node=>node.textContent),state:grown[1].querySelector('small').textContent,input:input.value};
 root.unmount();return result;`),
		).toEqual({
			shrunk: true,
			replacement: true,
			survivor: true,
			remount: true,
			labels: ['new', 'B', 'C'],
			state: '1',
			input: 'typed',
		});
	});

	it('prepares the list keys before a child changes application conversion', async () => {
		expect(
			await observe(`
 const a={id:'key:a',label:'A',value:1}, b={id:'key:b',label:'B',value:2}, root=createRoot(host), string=String;
 root.render(App,{items:[a,b],theme:'one'});flushSync(()=>{});
 const first=[...host.querySelectorAll('article')], input=first[1].querySelector('input');input.value='typed';
 setOnRender(id=>{ if(id==='key:a') globalThis.String=new Proxy(string,{apply(target,receiver,args){
  if(args[0]==='key:b') throw new Error('conversion after child render');
  return Reflect.apply(target,receiver,args);
 }}); });
 let error;
 try { flushSync(()=>root.render(App,{items:[{...a,label:'changed'},b],theme:'one'})); }
 catch(failure) { error=failure.message; }
 finally { globalThis.String=string;setOnRender(()=>{}); }
 const after=[...host.querySelectorAll('article')];
 const result={error:error??null,identity:after[0]===first[0]&&after[1]===first[1],labels:[...host.querySelectorAll('button')].map(node=>node.textContent),input:input.value};
 root.unmount();return result;`),
		).toEqual({ error: null, identity: true, labels: ['changed', 'B'], input: 'typed' });
	});

	it.each(['helper', 'row'])(
		'retains the prior keyed list when a later %s suspends after a reorder',
		async (mode) => {
			expect(
				await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, c={id:'c',label:'C',value:3}, root=createRoot(host);
 root.render(App,{items:[a,b,c],theme:'one'});flushSync(()=>{});
 const first=[...host.querySelectorAll('article')], input=first[0].querySelector('input');input.value='typed';
 let resolve; const wait=new Promise(done=>{resolve=done;});
 const waiting=${JSON.stringify(mode)}==='helper'?{...c,id:{toString(){throw wait;}}}:{...c,wait};
 flushSync(()=>root.render(App,{items:[b,a,waiting],theme:'two'}));
 const heldNodes=[...host.querySelectorAll('article')];
 const held=heldNodes.length===first.length&&heldNodes.every((node,index)=>node===first[index]);
 flushSync(()=>root.render(App,{items:[a,b,c],theme:'three'}));
 const restored=[...host.querySelectorAll('article')];
 const result={held,identity:restored.length===first.length&&restored.every((node,index)=>node===first[index]),labels:[...host.querySelectorAll('button')].map(node=>node.textContent),input:input.value,themes:[...host.querySelectorAll('output')].map(node=>node.textContent)};
 root.unmount();resolve();await Promise.resolve();return result;`),
			).toEqual({
				held: true,
				identity: true,
				labels: ['A', 'B', 'C'],
				input: 'typed',
				themes: ['three', 'three', 'three'],
			});
		},
	);

	it.each([
		'own defaults',
		'wrapper accessor',
		'inherited defaults',
		'object defaults',
		'custom prototype',
	])('observes %s installed between helper calls', async (mode) => {
		const result = await observe(`
 const item = {id:'a',label:undefined,value:1}, root = createRoot(host);
 root.render(App,{items:[item],theme:'first'}); flushSync(()=>{});
 const article = host.querySelector('article'), input = host.querySelector('input'); input.value='typed';
 const mode=${JSON.stringify(mode)}, body=Row.type, originalProto=Object.getPrototypeOf(body);
 const target=mode==='wrapper accessor'?Row:mode==='inherited defaults'?Function.prototype:mode==='object defaults'?Object.prototype:body;
 const previous=Object.getOwnPropertyDescriptor(target,'defaultProps');
 try {
  if(mode==='custom prototype') Object.setPrototypeOf(body,Object.create(originalProto,{defaultProps:{value:{projectionText:'late'}}}));
  else Object.defineProperty(target,'defaultProps',{configurable:true,...(mode==='wrapper accessor'?{get(){return {projectionText:'late'};}}:{value:{projectionText:'late'}})});
  flushSync(()=>root.render(App,{items:[item],theme:'first'}));
  return {text:host.querySelector('button').textContent,identity:host.querySelector('article')===article,input:input.value};
 } finally {
  if(mode==='custom prototype') Object.setPrototypeOf(body,originalProto);
  else if(previous) Object.defineProperty(target,'defaultProps',previous); else delete target.defaultProps;
  root.unmount();
 }`);
		expect(result).toEqual({ text: 'late', identity: true, input: 'typed' });
	});

	it('keeps authored default reads after the original input reads', async () => {
		expect(
			await observe(`
 const item={id:'a',label:undefined,value:1}, root=createRoot(host), trace=[];
 root.render(App,{items:[item],theme:'first'}); flushSync(()=>{});
 Object.defineProperty(Row.type,'defaultProps',{configurable:true,get(){trace.push('defaults');return {projectionText:'late'};}});
 const items=new Proxy([item],{get(target,key,receiver){if(key==='length')trace.push('length');return Reflect.get(target,key,receiver);}});
 try {
  flushSync(()=>root.render(App,{items,theme:'first'}));
  return {first:trace[0],defaults:trace.includes('defaults'),text:host.querySelector('button').textContent};
 } finally {delete Row.type.defaultProps;root.unmount();}`),
		).toEqual({ first: 'length', defaults: true, text: 'late' });
	});

	it('preserves copied-property setters installed between helper calls', async () => {
		expect(
			await observe(`
 const item={id:'a',label:'original',value:1}, root=createRoot(host), copies=[];
 root.render(Boundary,{items:[item],theme:'first'}); flushSync(()=>{});
 try {
  Object.defineProperty(Object.prototype,'projectionText',{configurable:true,get(){return 'inherited';},set(value){copies.push(value);}});
  flushSync(()=>root.render(Boundary,{items:[item],theme:'first'}));
  const inherited=host.querySelector('button').textContent;
  return {inherited,copies};
 } finally {delete Object.prototype.projectionText;root.unmount();}`),
		).toEqual({ inherited: 'inherited', copies: ['original'] });
	});

	it('keeps a nonwritable copied property on the ordinary factory path', async () => {
		expect(
			await observe(`
 const item={id:'a',label:'original',value:1}, root=createRoot(host);
 root.render(Boundary,{items:[item],theme:'first'}); flushSync(()=>{});
 try {
  Object.defineProperty(Object.prototype,'projectionText',{configurable:true,writable:false,value:'blocked'});
  let expected;
  try {expected={text:buildRows([item])[0].props.projectionText,error:false};}
  catch {expected={text:null,error:true};}
  flushSync(()=>root.render(Boundary,{items:[item],theme:'first'}));
  const actual={text:host.querySelector('button')?.textContent??null,error:host.querySelector('[data-error]')!==null};
  return {same:JSON.stringify(actual)===JSON.stringify(expected),ordinaryChanged:expected.text==='blocked'||expected.error};
 } finally {delete Object.prototype.projectionText;root.unmount();}`),
		).toEqual({ same: true, ordinaryChanged: true });
	});

	it.each(['children', 'ref'])('preserves inherited factory %s reads', async (name) => {
		expect(
			await observe(`
 const item={id:'a',label:'original',value:1}, root=createRoot(host);
 root.render(Boundary,{items:[item],theme:'first'}); flushSync(()=>{});
 try {
  Object.defineProperty(Object.prototype,${JSON.stringify(name)},{configurable:true,set(value){Object.defineProperty(this,${JSON.stringify(name)},{configurable:true,writable:true,enumerable:true,value});},get(){
   if(Object.hasOwn(this,'projectionText')) throw new Error('factory inherited ${name}');
   return undefined;
  }});
  flushSync(()=>root.render(Boundary,{items:[item],theme:'first'}));
  return host.querySelector('[data-error]')?.textContent;
 } finally {delete Object.prototype[${JSON.stringify(name)}];root.unmount();}`),
		).toBe(`factory inherited ${name}`);
	});

	it('does not move cold empty or throwing-input reads into a metadata guard', async () => {
		expect(
			await observe(`
 const root=createRoot(host), reads=[];
 Object.defineProperty(Row.type,'defaultProps',{configurable:true,get(){reads.push('defaults');return {};}});
 try {
  root.render(Boundary,{items:[],theme:'first'}); flushSync(()=>{});
  const emptyReads=reads.slice();
  const items={get length(){throw new Error('length failed');}};
  flushSync(()=>root.render(Boundary,{items,theme:'first'}));
  return {emptyReads,reads,error:host.querySelector('[data-error]')?.textContent};
 } finally {delete Row.type.defaultProps;root.unmount();}`),
		).toEqual({ emptyReads: [], reads: [], error: 'length failed' });
	});

	it('refreshes unchanged context consumers beside an immutable changed row', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, root=createRoot(host), events=[];
 setOnPick((id,label)=>events.push([id,label]));
 root.render(App,{items:[a,b],theme:'one'}); flushSync(()=>{});
 const before=[...host.querySelectorAll('article')], input=before[1].querySelector('input');input.value='typed';input.focus();
 const changed={...a,label:'changed',value:3};
 flushSync(()=>root.render(App,{items:[changed,b],theme:'two'}));
 const updated=[...host.querySelectorAll('output')].map(node=>node.textContent);
 setOnPick((id,label)=>events.push(['new',id,label]));
 flushSync(()=>root.render(App,{items:[b,changed],theme:'three'}));
 host.querySelectorAll('button')[1].click();flushSync(()=>{});
 const after=[...host.querySelectorAll('article')];
 const result={updated,final:[...host.querySelectorAll('output')].map(node=>node.textContent),identity:after[0]===before[1]&&after[1]===before[0],input:input.value,focus:document.activeElement===input,events};
 root.unmount();return result;`),
		).toEqual({
			updated: ['two', 'two'],
			final: ['three', 'three'],
			identity: true,
			input: 'typed',
			focus: true,
			events: [['new', 'a', 'changed']],
		});
	});

	it('keeps fresh public descriptors when an inspecting child receives a new array', async () => {
		expect(
			await observe(`
 const item={id:'a',label:'A',value:1}, root=createRoot(host);
 root.render(Inspected,{items:[item]});flushSync(()=>{});
 const first=readInspection(), article=host.querySelector('article');
 flushSync(()=>root.render(Inspected,{items:[item]}));
 const second=readInspection();
 const result={arrays:first!==second,descriptors:first[0]!==second[0],props:first[0].props!==second[0].props,identity:host.querySelector('article')===article,label:host.querySelector('button').textContent};
 root.unmount();return result;`),
		).toEqual({ arrays: true, descriptors: true, props: true, identity: true, label: 'A' });
	});

	it('reconnects visibly reordered Activity rows with state and inputs intact', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, items=[a,b], root=createRoot(host);
 root.render(Retained,{items,theme:'one',visible:true});flushSync(()=>{});
 const before=[...host.querySelectorAll('article')], input=before[0].querySelector('input');input.value='typed';
 flushSync(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 const next=[b,{...a,label:'changed'}];
 flushSync(()=>root.render(Retained,{items:next,theme:'two',visible:true}));
 lifecycle.length=0;
 flushSync(()=>root.render(Retained,{items:next,theme:'two',visible:false}));
 const hidden=lifecycle.slice();lifecycle.length=0;
 flushSync(()=>root.render(Retained,{items:next,theme:'two',visible:true}));
 const after=[...host.querySelectorAll('article')];
 const result={hidden,reconnected:lifecycle.slice(),identity:after[0]===before[1]&&after[1]===before[0],labels:[...host.querySelectorAll('button')].map(node=>node.textContent),state:[...host.querySelectorAll('small')].map(node=>node.textContent),input:input.value};
 root.unmount();return result;`),
		).toEqual({
			hidden: ['disconnect:b', 'disconnect:a'],
			reconnected: ['connect:b', 'connect:a'],
			identity: true,
			labels: ['B', 'changed'],
			state: ['0', '1'],
			input: 'typed',
		});
	});

	it('preserves rows when an undefined key enters and leaves the list before a reorder', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, loose={id:undefined,label:'loose',value:3}, root=createRoot(host);
 root.render(App,{items:[a,b],theme:'one'});flushSync(()=>{});
 const before=[...host.querySelectorAll('article')], input=before[0].querySelector('input');input.value='typed';
 flushSync(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 flushSync(()=>root.render(App,{items:[a,b,loose],theme:'two'}));
 const middle=[...host.querySelectorAll('article')];
 const fallback={identity:middle[0]===before[0]&&middle[1]===before[1],labels:[...host.querySelectorAll('button')].map(node=>node.textContent)};
 flushSync(()=>root.render(App,{items:[b,a],theme:'three'}));
 const after=[...host.querySelectorAll('article')];
 const result={fallback,identity:after[0]===before[1]&&after[1]===before[0],labels:[...host.querySelectorAll('button')].map(node=>node.textContent),state:[...host.querySelectorAll('small')].map(node=>node.textContent),input:input.value,themes:[...host.querySelectorAll('output')].map(node=>node.textContent)};
 root.unmount();return result;`),
		).toEqual({
			fallback: { identity: true, labels: ['A', 'B', 'loose'] },
			identity: true,
			labels: ['B', 'A'],
			state: ['0', '1'],
			input: 'typed',
			themes: ['three', 'three'],
		});
	});

	it('rolls back a changed list when a retained row suspends, then accepts and reorders', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, root=createRoot(host);
 root.render(App,{items:[a,b],theme:'one'});flushSync(()=>{});
 const before=[...host.querySelectorAll('article')], input=before[0].querySelector('input');input.value='typed';
 let resolve;const wait=new Promise(done=>{resolve=done;});
 const changed={...a,label:'changed'}, waiting={...b,wait};
 flushSync(()=>root.render(App,{items:[changed,waiting],theme:'two'}));
 const held=[...host.querySelectorAll('button')].map(node=>node.textContent);
 const retained=[...host.querySelectorAll('article')].every((node,index)=>node===before[index]);
 resolve('ready');await new Promise(done=>setTimeout(done,0));flushSync(()=>{});
 const accepted=[...host.querySelectorAll('button')].map(node=>node.textContent);
 flushSync(()=>root.render(App,{items:[waiting,changed],theme:'three'}));
 const after=[...host.querySelectorAll('article')];
 const result={held,retained,accepted,identity:after[0]===before[1]&&after[1]===before[0],input:input.value,themes:[...host.querySelectorAll('output')].map(node=>node.textContent)};
 root.unmount();return result;`),
		).toEqual({
			held: ['A', 'B'],
			retained: true,
			accepted: ['changed', 'B'],
			identity: true,
			input: 'typed',
			themes: ['three', 'three'],
		});
	});

	it('adopts the server rows before a client update and reorder', async () => {
		const { html } = server.renderToString(server.App, {
			items: [
				{ id: 'a', label: 'A', value: 1 },
				{ id: 'b', label: 'B', value: 2 },
			],
			theme: 'server',
		});
		expect(
			await observe(
				`
 const a={id:'a',label:'A',value:1}, b={id:'b',label:'B',value:2}, before=[...host.querySelectorAll('article')], input=before[1].querySelector('input');input.value='typed';
 const errors=[], root=hydrateRoot(host,App,{items:[a,b],theme:'server'},{onRecoverableError:error=>errors.push(String(error))});flushSync(()=>{});
 const adopted=[...host.querySelectorAll('article')].every((node,index)=>node===before[index]);
 const changed={...a,label:'changed'};
 flushSync(()=>root.render(App,{items:[changed,b],theme:'client'}));
 flushSync(()=>root.render(App,{items:[b,changed],theme:'next'}));
 const after=[...host.querySelectorAll('article')];const result={adopted,identity:after[0]===before[1]&&after[1]===before[0],input:input.value,labels:[...host.querySelectorAll('button')].map(node=>node.textContent),themes:[...host.querySelectorAll('output')].map(node=>node.textContent),errors};
 root.unmount();return result;`,
				html,
			),
		).toEqual({
			adopted: true,
			identity: true,
			input: 'typed',
			labels: ['B', 'changed'],
			themes: ['next', 'next'],
			errors: [],
		});
	});
});

describe('rows when input length changes', () => {
	it.each([
		{
			name: 'shrinking with trailing holes',
			allocation: 4,
			limits: [4, 1],
			labels: ['A'],
			retainedA: true,
		},
		{
			name: 'zero writes after allocation',
			allocation: 2,
			limits: [0],
			labels: [],
			retainedA: false,
		},
		{
			name: 'growing while iterating',
			allocation: 0,
			limits: [1, 2, 3, 3],
			labels: ['A', 'B', 'C'],
			retainedA: true,
		},
		{
			name: 'string allocation followed by growth',
			allocation: '3',
			limits: [2],
			labels: ['A', 'B'],
			retainedA: true,
		},
		{
			name: 'string allocation without writes',
			allocation: 'x',
			limits: [0],
			labels: [],
			retainedA: false,
		},
	])('preserves rows and authored reads while $name', async (scenario) => {
		const result = await observe(`
 const a={id:'a',label:'A',value:1},b={id:'b',label:'B',value:2},c={id:'c',label:'C',value:3},root=createRoot(host);
 root.render(App,{items:[a,b],theme:'one'});flushSync(()=>{});
 const first=host.querySelector('article'), input=first.querySelector('input');input.value='typed';
 const scenario=${JSON.stringify(scenario)},rows=[a,b,c];
 const source=()=>{
  const reads=[];let lengthReads=0;
  return {reads,items:new Proxy({}, {get(_target,key){
   reads.push(String(key));
   if(key==='length'){const at=lengthReads++;return at===0?scenario.allocation:scenario.limits[Math.min(at-1,scenario.limits.length-1)];}
   return rows[Number(key)];
  }})};
 };
 const expected=source();buildRows(expected.items);
 const actual=source();flushSync(()=>root.render(App,{items:actual.items,theme:'two'}));
 const labels=[...host.querySelectorAll('button')].map(node=>node.textContent),current=host.querySelector('article');
 const retainedA=current===first,visibleInput=current?.querySelector('input').value??null;
 const literalText=scenario.allocation==='x'?host.querySelector('section').textContent:null;
 flushSync(()=>root.render(App,{items:[a,b],theme:'three'}));
 const result={labels,retainedA,visibleInput,literalText,reads:actual.reads,expectedReads:expected.reads,recovered:[...host.querySelectorAll('button')].map(node=>node.textContent)};
 root.unmount();return result;`);
		expect(result.reads).toEqual(result.expectedReads);
		expect(result).toEqual({
			labels: scenario.labels,
			retainedA: scenario.retainedA,
			visibleInput: scenario.labels.length ? 'typed' : null,
			literalText: scenario.allocation === 'x' ? 'x' : null,
			reads: expect.any(Array),
			expectedReads: expect.any(Array),
			recovered: ['A', 'B'],
		});
	});
});

describe('raw key changes across held updates', () => {
	it('retries a changed live key after a held transition without reusing the old row', async () => {
		expect(
			await observe(`
 const a={id:'a',label:'A',value:1},b={id:'b',label:'B',value:2},root=createRoot(host);
 let update;root.render(TransitionRows,{items:[a,b],theme:'one',bind:next=>{update=next;}});await act(()=>{});
 const before=[...host.querySelectorAll('article')],input=before[0].querySelector('input');input.value='typed';
 await act(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 let resolve;const wait=new Promise(done=>{resolve=done;});let attempted=false;
 a.id='z';setOnRender(id=>{if(id==='b')attempted=true;});
 await act(()=>startTransition(()=>update([a,{...b,wait}])));
 const held=[...host.querySelectorAll('article')];
 const retained=held.length===2&&held[0]===before[0]&&held[1]===before[1]&&input.value==='typed';
 await act(()=>update([a,b]));
 const after=[...host.querySelectorAll('article')];
 const result={attempted,retained,ids:after.map(node=>node.getAttribute('data-row')),replaced:after[0]!==before[0],survivor:after[1]===before[1],input:after[0].querySelector('input').value,state:after[0].querySelector('small').textContent,labels:after.map(node=>node.querySelector('button').textContent)};
 await act(()=>resolve('ready'));root.unmount();return result;`),
		).toEqual({
			attempted: true,
			retained: true,
			ids: ['z', 'b'],
			replaced: true,
			survivor: true,
			input: 'draft',
			state: '0',
			labels: ['A', 'B'],
		});
	});
});

describe('unkeyed row state across new arrays', () => {
	it('preserves unkeyed input state before recovering to explicit keys', async () => {
		expect(
			await observe(`
 const a={id:undefined,label:'A',value:1},b={id:undefined,label:'B',value:2},root=createRoot(host);
 root.render(App,{items:[a,b],theme:'one'});flushSync(()=>{});
 const before=[...host.querySelectorAll('article')],input=before[0].querySelector('input');input.value='typed';
 flushSync(()=>input.dispatchEvent(new Event('input',{bubbles:true})));
 flushSync(()=>root.render(App,{items:[a,b],theme:'one'}));
 const after=[...host.querySelectorAll('article')];
 const unkeyed={identity:after.length===2&&after[0]===before[0]&&after[1]===before[1],input:after[0].querySelector('input').value,state:after[0].querySelector('small').textContent,labels:after.map(node=>node.querySelector('button').textContent)};
 const ka={...a,id:'a'},kb={...b,id:'b'};
 flushSync(()=>root.render(App,{items:[ka,kb],theme:'two'}));
 const keyed=[...host.querySelectorAll('article')],keyedInput=keyed[0].querySelector('input');keyedInput.value='keyed draft';
 flushSync(()=>keyedInput.dispatchEvent(new Event('input',{bubbles:true})));
 flushSync(()=>root.render(App,{items:[kb,ka],theme:'three'}));
 const reordered=[...host.querySelectorAll('article')];
 const recovered={identity:reordered.length===2&&reordered[0]===keyed[1]&&reordered[1]===keyed[0],input:reordered[1].querySelector('input').value,state:reordered[1].querySelector('small').textContent,labels:reordered.map(node=>node.querySelector('button').textContent),themes:reordered.map(node=>node.querySelector('output').textContent)};
 root.unmount();return {unkeyed,recovered};`),
		).toEqual({
			unkeyed: { identity: true, input: 'typed', state: '1', labels: ['A', 'B'] },
			recovered: {
				identity: true,
				input: 'keyed draft',
				state: '1',
				labels: ['B', 'A'],
				themes: ['three', 'three'],
			},
		});
	});
});
