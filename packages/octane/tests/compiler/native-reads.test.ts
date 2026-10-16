import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const NAMING = 'OCTANE_NATIVE_SIGNAL_NAME';
const MEMO_READ = 'OCTANE_NATIVE_MEMO_READ';
const SIGNAL_IMPORT = 'OCTANE_NATIVE_SIGNAL_IMPORT';
const FILENAME = '/src/native-reads.tsrx';
const ORDINARY_DOLLAR = readFileSync(
	resolve(import.meta.dirname, '../_fixtures/native-reads-ordinary-dollar.tsrx'),
	'utf8',
);
const PREFIX = `import { createScope } from 'octane/signals';
const scope = createScope();
const count$ = scope.signal$('count', 0);
`;

function app(setup: string, module = PREFIX) {
	return `${module}
export function App() @{
  ${setup}
  <div />
}`;
}

const modes = [
	{ dev: true },
	{ dev: false, hmr: false },
	{ dev: false, hmr: false, strong: true },
	{ mode: 'server' },
] as const;

describe('native signal import diagnostics', () => {
	const typeImport = `import type { SignalHandle } from 'octane/signals';`;
	const read = 'props.count$.get()';
	const source = `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{
  <output>{String(${read})}</output>
}`;
	const throwingChild = `function ThrowingChild() { throw new Error('render failed'); }`;
	const signalValue = `${typeImport}
function SignalValue(props) @{ <output>{String(props.count$.get())}</output> }`;
	const typedSignalValue = `import type { OctaneNode } from 'octane';
${signalValue}`;
	const signalDescriptor = `${signalValue}
function descriptor(count$: SignalHandle<number>) { return <SignalValue count$={count$} />; }`;
	const recursiveUnion = (alternateSignal: string) => `${typeImport}
type Branch = { signal: SignalHandle<number>; next: Branch; left: string } | { signal: ${alternateSignal}; next: Branch; right: number };
export function Counter(props: { node: Branch }) @{ <output>{String(props.node.next.signal.get())}</output> }`;

	it.each([{ dev: true }, { dev: false, hmr: false }, { mode: 'server' }] as const)(
		'requires a runtime signals import for a proven render read in %j',
		(options) => {
			expect(() => compile(source, FILENAME, options)).toThrow(SIGNAL_IMPORT);
		},
	);

	it.each(['client', 'server'])(
		'requires a runtime import with a type-only signals/%s import',
		(entry) => {
			expect(() =>
				compile(source.replace('octane/signals', `octane/signals/${entry}`), FILENAME, {
					dev: true,
				}),
			).toThrow(SIGNAL_IMPORT);
		},
	);

	it.each(['@catch (_error)', '@pending'])(
		'accepts a read in an unreachable %s arm',
		(fallback) => {
			const input = `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { <span /> } ${fallback} { <output>{String(${read})}</output> } }`;
			expect(() => compile(input, FILENAME, { dev: true })).not.toThrow();
		},
	);

	it.each(['@catch (_error)', '@pending'])(
		'diagnoses a later render read when an unreachable %s arm throws',
		(fallback) => {
			const input = `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <section>@try { <span /> } ${fallback} { throw 0; <span /> } <output>{String(${read})}</output></section> }`;
			expect(() => compile(input, FILENAME, { dev: true })).toThrow(SIGNAL_IMPORT);
		},
	);

	it.each([
		{
			label: 'a reachable nullish fallback',
			source: source.replace(read, `null ?? ${read}`),
		},
		{
			label: 'an aliased named type and destructured prop',
			source: `import { type SignalHandle as Handle } from 'octane/signals';
export function Counter({ count$: value$ }: { count$: Handle<number> }) @{
  const count$ = value$;
  <output>{String(count$.latest())}</output>
}`,
		},
		{
			label: 'a namespace type import',
			source: `import type * as Signals from 'octane/signals';
export function Counter(props: { count$: Signals.SignalHandle<number> }) @{
  <output>{String(props.count$.snapshot().status)}</output>
}`,
		},
		{
			label: 'an inline type import',
			source: `export function Counter(props: { count$: import('octane/signals').SignalHandle<number> }) @{
  <output>{String(props.count$.get())}</output>
}`,
		},
		{
			label: 'a Unicode-escaped get identifier',
			source: String.raw`${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(props.count$.\u0067et())}</output> }`,
		},
		{
			label: 'an escaped slash in an inline signal type import',
			source: String.raw`export function Counter(props: { count$: import('octane\u002fsignals').SignalHandle<number> }) @{ <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a scope read',
			source: `import type { Scope, SignalHandle } from 'octane/signals';
export function Counter(props: { scope: Scope; count$: SignalHandle<number> }) @{
  <output>{String(props.scope.get(props.count$))}</output>
}`,
		},
		{
			label: 'a synchronously called local helper',
			source: `${typeImport}
function readCount$(count$: SignalHandle<number>) { return count$.get(); }
export function Counter(props: { count$: SignalHandle<number> }) @{
  <output>{String(readCount$(props.count$))}</output>
}`,
		},
		{
			label: 'an outer signal captured by a nested local helper',
			source: `${typeImport}
function outer$(count$: SignalHandle<number>) { function inner$() { return count$.get(); } return inner$(); }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(outer$(props.count$))}</output> }`,
		},
		{
			label: 'a synchronous useMemo callback',
			source: `import { useMemo } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{
  const label = useMemo(() => String(props.count$.get()));
  <output>{label as string}</output>
}`,
		},
		{
			label: 'a useState lazy initializer',
			source: `import { useState } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const [value] = useState(() => props.count$.get()); <output>{String(value)}</output> }`,
		},
		{
			label: 'a useReducer initializer receiving a typed signal',
			source: `import { useReducer } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const [value] = useReducer((state: number) => state, props.count$, count$ => count$.get()); <output>{String(value)}</output> }`,
		},
		{
			label: 'a useLinkedState reconcile callback receiving a typed source',
			source: `import { useLinkedState } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const [value] = useLinkedState(props.count$, count$ => count$.get()); <output>{String(value)}</output> }`,
		},
		{
			label: 'a useSyncExternalStore snapshot callback',
			source: `import { useSyncExternalStore } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const value = useSyncExternalStore(() => () => {}, () => props.count$.get()); <output>{String(value)}</output> }`,
		},
		{
			label: 'a plain function used as a local JSX component',
			source: `${typeImport}
function Counter(props: { count$: SignalHandle<number> }) {
  return <output>{String(props.count$.get())}</output>;
}
export function App(props: { count$: SignalHandle<number> }) @{ <Counter count$={props.count$} /> }`,
		},
		{
			label: 'a typed signal prop passed to an untyped local JSX child',
			source: `${typeImport}
function Child(props) @{ <output>{String(props.count$.get())}</output> }
export function Counter(props: { count$: SignalHandle<number> }) @{ <Child count$={props.count$} /> }`,
		},
		{
			label: 'a createElement component passed to root.render',
			source: `import { createElement, createRoot } from 'octane';
${typeImport}
declare const count$: SignalHandle<number>;
function Counter() { return createElement('output', null, String(count$.get())); }
createRoot(document.body).render(Counter);`,
		},
		{
			label: 'a typed signal prop passed through root.render',
			source: `import { createRoot } from 'octane';
${typeImport}
declare const typedHandle$: SignalHandle<number>;
function Child(props) @{ <output>{String(props.count$.get())}</output> }
createRoot(document.body).render(Child, { count$: typedHandle$ });`,
		},
		{
			label: 'a typed signal prop passed through an exported bootstrap',
			source: `import { createRoot } from 'octane';
${typeImport}
function Counter(props) @{ <output>{String(props.count$.get())}</output> }
export function bootstrap(host: Element, count$: SignalHandle<number>) { createRoot(host).render(Counter, { count$ }); }`,
		},
		{
			label: 'an exported function returning JSX',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) { return <output>{String(props.count$.get())}</output>; }`,
		},
		{
			label: 'an exported arrow returning JSX',
			source: `${typeImport}
export const Counter = (props: { count$: SignalHandle<number> }) => <output>{String(props.count$.get())}</output>;`,
		},
		{
			label: 'an exported memo-wrapped component',
			source: `import { memo } from 'octane';
${typeImport}
export const Counter = memo((props: { count$: SignalHandle<number> }) => <output>{String(props.count$.get())}</output>);`,
		},
		{
			label: 'a separately exported component',
			source: `${typeImport}
function Counter(props: { count$: SignalHandle<number> }) { return <output>{String(props.count$.get())}</output>; }
export { Counter };`,
		},
		{
			label: 'a local props interface',
			source: `${typeImport}
interface Props { count$: SignalHandle<number> }
export function Counter(props: Props) @{ <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'an inherited props interface',
			source: `${typeImport}
interface BaseProps { count$: SignalHandle<number> }
interface Props extends BaseProps {}
export function Counter(props: Props) @{ <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a signal reached through a recursive type alias',
			source: `${typeImport}
type Branch = { next: Branch; count$: SignalHandle<number> };
export function Counter(props: { branch: Branch }) @{ <output>{String(props.branch.next.next.count$.get())}</output> }`,
		},
		{
			label: 'a signal reached through a recursive interface',
			source: `${typeImport}
interface Branch { next: Branch; count$: SignalHandle<number> }
export function Counter(props: { branch: Branch }) @{ <output>{String(props.branch.next.count$.get())}</output> }`,
		},
		{
			label: 'a signal reached through mutually recursive aliases',
			source: `${typeImport}
type Branch = { next: Leaf };
type Leaf = { parent: Branch; count$: SignalHandle<number> };
export function Counter(props: { branch: Branch }) @{ <output>{String(props.branch.next.parent.next.count$.get())}</output> }`,
		},
		{
			label: 'a signal shared by recursive union branches',
			source: recursiveUnion('SignalHandle<number>'),
		},
		{
			label: 'a signal shared by otherwise distinct union branches',
			source: `${typeImport}
type Entry = { signal: SignalHandle<number>; left: string } | { signal: SignalHandle<number>; right: number };
export function Counter(props: { entry: Entry }) @{ <output>{String(props.entry.signal.get())}</output> }`,
		},
		{
			label: 'a signal handle type assertion',
			source: `${typeImport}
export function Counter(props: { count: unknown }) @{ <output>{String((props.count as SignalHandle<number>).get())}</output> }`,
		},
		{
			label: 'a nullable handle through optional chaining',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> | null }) @{ <output>{String(props.count$?.get())}</output> }`,
		},
		{
			label: 'a guarded nullable handle',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> | null }) @{ let value = 0; if (props.count$ !== null) value = props.count$.get(); <output>{String(value)}</output> }`,
		},
		{
			label: 'a read after a conditional await with a synchronous path',
			source: `${typeImport}
async function readCount$(count$: SignalHandle<number>, defer: boolean) { if (defer) await Promise.resolve(); return count$.get(); }
export function Counter(props: { count$: SignalHandle<number>; defer: boolean }) @{ void readCount$(props.count$, props.defer); <output /> }`,
		},
		{
			label: 'a catch reached by an explicit throw',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ let value = 0; try { throw 0; } catch { value = props.count$.get(); } <output>{String(value)}</output> }`,
		},
		{
			label: 'a template catch reached by an explicit throw',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { throw 0; <span /> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a template pending arm reached by a suspended read',
			source: `import { use } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number>; promise: Promise<string> }) @{ @try { <span>{use(props.promise) as string}</span> } @pending { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm reached by a suspending accessor',
			source: `import { use } from 'octane';
${typeImport}
export function Counter({ count$, promise }: { count$: SignalHandle<number>; promise: Promise<string> }) @{ const model = { get label() { return use(promise); }, set label(value) {} }; @try { <span>{model.label as string}</span> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm after an object escapes',
			source: `import { use } from 'octane';
${typeImport}
export function Counter({ count$, promise }: { count$: SignalHandle<number>; promise: Promise<string> }) @{ const model = { label: 'ready' }; Object.defineProperty(model, 'label', { get() { return use(promise); } }); @try { <span>{model.label as string}</span> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a template catch around an opaque child component',
			source: `import Child from './child';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { <Child /> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a template catch around a rendered local descriptor',
			source: `${typeImport}
${throwingChild}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { const child = <ThrowingChild />; <div>{child}</div> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a template catch around a forwarded descriptor',
			source: `import type { OctaneNode } from 'octane';
${typeImport}
${throwingChild}
function Forward({ child }: { child: OctaneNode }) @{ <div>{child}</div> }
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { <Forward child={<ThrowingChild />} /> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a helper-returned descriptor assigned and rendered',
			source: `${signalDescriptor}
export function Counter(props: { count$: SignalHandle<number> }) @{ const child = descriptor(props.count$); <div>{child}</div> }`,
		},
		{
			label: 'a union-typed signal descriptor rendered in a hole',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const child: OctaneNode | string = <SignalValue count$={count$} />; <div>{child}</div> }`,
		},
		{
			label: 'a signal child in a typed local array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = [<SignalValue count$={count$} />]; void children.length; <div>{children}</div> }`,
		},
		{
			label: 'a signal child inserted into a typed array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = [null, null]; children[0] = <span />; children[1] = <SignalValue count$={count$} />; const size = children.length; <div>{children}{children}</div> }`,
		},
		{
			label: 'an inserted signal child before a throwing child',
			source: `${typedSignalValue}
${throwingChild}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = []; children[1] = <ThrowingChild />; children[0] = <SignalValue count$={count$} />; <div>{children}</div> }`,
		},
		{
			label: 'a signal child in a typed tuple',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: [OctaneNode] = [<SignalValue count$={count$} />]; <div>{children}</div> }`,
		},
		{
			label: 'a signal child in a readonly array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: readonly OctaneNode[] = [<SignalValue count$={count$} />]; <div>{children}</div> }`,
		},
		{
			label: 'a signal child in a typed children array',
			source: `${typedSignalValue}
function Frame({ children }: { children: OctaneNode[] }) @{ <div>{children}</div> }
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ <Frame children={[<SignalValue count$={count$} />]} /> }`,
		},
		{
			label: 'a signal child in a nested typed array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const rows: OctaneNode[][] = [[<SignalValue count$={count$} />]]; <div>{rows}</div> }`,
		},
		{
			label: 'a signal child in a JSX children array',
			source: `${typedSignalValue}
function Frame({ children }: { children: OctaneNode[] }) @{ <div>{children}</div> }
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ <Frame><span /><SignalValue count$={count$} /></Frame> }`,
		},
		{
			label: 'a helper-returned descriptor returned directly by a component',
			source: `${signalDescriptor}
function Forward(props: { count$: SignalHandle<number> }) { return descriptor(props.count$); }
export function Counter(props: { count$: SignalHandle<number> }) @{ <Forward count$={props.count$} /> }`,
		},
		{
			label: 'a conditional descriptor returned directly by a component',
			source: `${signalValue}
export function Counter(props: { count$: SignalHandle<number>; show: boolean }) { return props.show ? <SignalValue count$={props.count$} /> : <span />; }`,
		},
		{
			label: 'a logical descriptor rendered in a child hole',
			source: `${signalValue}
export function Counter(props: { count$: SignalHandle<number>; show: boolean }) @{ <div>{props.show && <SignalValue count$={props.count$} />}</div> }`,
		},
		{
			label: 'a conditional descriptor returned from a local helper',
			source: `${signalValue}
function choose(count$: SignalHandle<number>, show: boolean) { return show ? <SignalValue count$={count$} /> : <span />; }
export function Counter(props: { count$: SignalHandle<number>; show: boolean }) @{ <div>{choose(props.count$, props.show)}</div> }`,
		},
		{
			label: 'a template pending arm around a renderable child',
			source: `import type { OctaneNode } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number>; child: OctaneNode }) @{ @try { <span>{props.child}</span> } @pending { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a render read after a nested template arm returns',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <section>@try { <div>@if (true) { return; <span /> }</div> } @catch (_error) { <span /> } <output>{String(props.count$.get())}</output></section> }`,
		},
		{
			label: 'a render read after a template loop row continues',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <section>@try { <ul>@for (const item of [1]; key item) { continue; <li /> }</ul> } @catch (_error) { <span /> } <output>{String(props.count$.get())}</output></section> }`,
		},
		{
			label: 'a read after an explicit throw was caught',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ try { throw 0; } catch {} <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a finally block reached after return',
			source: `${typeImport}
function readCount$(count$: SignalHandle<number>) { try { return 0; } finally { count$.get(); } }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(readCount$(props.count$))}</output> }`,
		},
		{
			label: 'a read after a for-of loop breaks',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ for (const item of [1]) { break; } <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a read after switch cases break',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number>; mode: string }) @{ switch (props.mode) { case 'one': break; default: break; } <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a read in a later switch case after an earlier case returns',
			source: `${typeImport}
function readCount$(count$: SignalHandle<number>, mode: string) { switch (mode) { case 'skip': return 0; case 'read': return count$.get(); default: return 0; } }
export function Counter(props: { count$: SignalHandle<number>; mode: string }) @{ <output>{String(readCount$(props.count$, props.mode))}</output> }`,
		},
		{
			label: 'a read after a labeled block breaks',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ exit: { break exit; } <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'a read in an immediately accessed object literal getter',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(({ get value() { return props.count$.get(); } }).value)}</output> }`,
		},
		{
			label: 'an instantiated base-class field initializer',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ class Base { value = props.count$.get(); } class Derived extends Base {} <output>{String(new Derived().value)}</output> }`,
		},
		{
			label: 'a derived field initialized after an explicit super call',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ class Base {} class Derived extends Base { value = props.count$.get(); constructor() { super(); } } <output>{String(new Derived().value)}</output> }`,
		},
		{
			label: 'a detached read passed to useMemo',
			source: `import { useMemo } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(useMemo(props.count$.get))}</output> }`,
		},
		{
			label: 'an untyped helper called with a typed handle',
			source: `${typeImport}
function readCount$(count$) { return count$.get(); }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(readCount$(props.count$))}</output> }`,
		},
		{
			label: 'a generic constrained to a signal handle',
			source: `${typeImport}
export function Counter<T extends SignalHandle<number>>(props: { count$: T }) @{ <output>{String(props.count$.get())}</output> }`,
		},
		{
			label: 'an indexed typed handle array',
			source: `${typeImport}
export function Counter(props: { counts$: SignalHandle<number>[] }) @{ <output>{String(props.counts$[0].get())}</output> }`,
		},
		{
			label: 'a dynamically indexed handle array',
			source: `${typeImport}
export function Counter(props: { counts$: SignalHandle<number>[]; index: number }) @{ <output>{String(props.counts$[props.index].get())}</output> }`,
		},
		{
			label: 'a generic Array of handles',
			source: `${typeImport}
export function Counter(props: { counts$: Array<SignalHandle<number>> }) @{ <output>{String(props.counts$[0].get())}</output> }`,
		},
		{
			label: 'a handle read while iterating a typed array prop',
			source: `${typeImport}
export function Counter(props: { counts$: SignalHandle<number>[] }) @{ let total = 0; for (const count$ of props.counts$) { total += count$.get(); } <output>{String(total)}</output> }`,
		},
		{
			label: 'a handle read in a keyed template loop',
			source: `${typeImport}
export function Counter(props: { counts$: SignalHandle<number>[] }) @{ <ul>@for (const item of props.counts$; key item.key) { <li>{String(item.get())}</li> }</ul> }`,
		},
		{
			label: 'a read in a live template else arm',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <section>@if (false) { <output /> } @else { <output>{String(props.count$.get())}</output> }</section> }`,
		},
		{
			label: 'a callback on a fresh nonempty handle array',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String([props.count$].map(count$ => count$.get()))}</output> }`,
		},
		{
			label: 'a reachable read in a cyclic local call graph',
			source: `${typeImport}
function first$(count$: SignalHandle<number>, depth: number): number { return depth ? second$(count$, depth - 1) : count$.get(); }
function second$(count$: SignalHandle<number>, depth: number): number { return depth ? first$(count$, depth - 1) : 0; }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(first$(props.count$, 2))}</output> }`,
		},
	])('requires a runtime signals import for $label', ({ source: missingImport }) => {
		expect(() => compile(missingImport, FILENAME, { dev: true })).toThrow(SIGNAL_IMPORT);
	});

	it('requires a runtime signals import in a plain TypeScript custom hook', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const hook = `import { useMemo } from 'octane';
${typeImport}
export function useCount(signal: SignalHandle<number>) { return useMemo(() => signal.get()); }`;
		expect(() => compiler.transform(hook, '/project/src/use-count.ts', { dev: true })).toThrow(
			SIGNAL_IMPORT,
		);
	});

	it('points the editor to the read and explains how to enable it', () => {
		const diagnostic = compileToVolarMappings(source, FILENAME, {}).diagnostics.find(
			(entry) => entry.code === SIGNAL_IMPORT,
		);
		expect(diagnostic).toMatchObject({
			severity: 'error',
			filename: FILENAME,
			message: expect.stringMatching(/import.*octane\/signals/i),
		});
		const readStart = source.indexOf(read);
		expect(diagnostic!.start.offset).toBeGreaterThanOrEqual(readStart);
		expect(diagnostic!.end.offset).toBeGreaterThan(diagnostic!.start.offset);
		expect(diagnostic!.end.offset).toBeLessThanOrEqual(readStart + read.length);
	});

	it.each([
		{
			label: 'a runtime import',
			source: `import 'octane/signals';\n${source}`,
		},
		{
			label: 'an ordinary getter beside a direct signal binding',
			source: `${typeImport}
export function Counter(props: { cache$: Map<string, number>; count$: SignalHandle<number> }) @{
  <section><output>{String(props.cache$.get('count'))}</output><input value={props.count$} /></section>
}`,
		},
		{
			label: 'reads deferred to an event or effect',
			source: `import { useEffect } from 'octane';
${typeImport}
declare function record(value: number): void;
function readCount$(count$: SignalHandle<number>) { return count$.get(); }
export function Counter(props: { count$: SignalHandle<number> }) @{
  useEffect(() => record(readCount$(props.count$)), []);
  <button onClick={() => record(readCount$(props.count$))}>Read</button>
}`,
		},
		{
			label: 'a deferred useLayoutSnapshot measure callback',
			source: `import { useLayoutSnapshot } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const value = useLayoutSnapshot(() => props.count$.get(), { initial: 0 }); <output>{String(value)}</output> }`,
		},
		{
			label: 'a local template helper called only from an event',
			source: `${typeImport}
function readCount$(count$: SignalHandle<number>) @{ <output>{String(count$.get())}</output> }
export function Counter(props: { count$: SignalHandle<number> }) @{ <button onClick={() => readCount$(props.count$)}>Read</button> }`,
		},
		{
			label: 'an imperative module read',
			source: `${typeImport}
declare const count$: SignalHandle<number>;
const initialCount = count$.get();
export function Counter() @{ <output>{String(initialCount)}</output> }`,
		},
		{
			label: 'a read in a statically false branch',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ if (false) props.count$.get(); <output /> }`,
		},
		{
			label: 'a read in a statically false template if arm',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ <section>@if (false) { <output>{String(props.count$.get())}</output> }</section> }`,
		},
		{
			label: 'a component reachable only through an unreachable root render',
			source: `import { createElement, createRoot } from 'octane';
${typeImport}
declare const count$: SignalHandle<number>;
function Counter() { return createElement('output', null, String(count$.get())); }
if (false) createRoot(document.body).render(Counter);`,
		},
		{
			label: 'a read in a statically false while loop',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ while (false) { props.count$.get(); } <output /> }`,
		},
		{
			label: 'a read in a for-of loop over an empty array',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ for (const item of []) { props.count$.get(); } <output /> }`,
		},
		{
			label: 'a read after an unconditional return',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) { return <output />; props.count$.get(); }`,
		},
		{
			label: 'a catch that cannot be reached from an empty try',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ try {} catch { props.count$.get(); } <output /> }`,
		},
		{
			label: 'a pending arm after an ordinary Error is caught',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { throw new Error('failed'); <span /> } @pending { <output>{String(props.count$.get())}</output> } @catch (_error) { <span /> } }`,
		},
		{
			label: 'a pending arm around a typed text child',
			source: `${typeImport}
export function Counter({ count$, label }: { count$: SignalHandle<number>; label: string }) @{ @try { <span>{label as string}</span> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm around an inert member read',
			source: `${typeImport}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const model = { label: 'ready' }; void model.label; @try { <span>{model.label as string}</span> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a catch around an ignored JSX prop',
			source: `${typeImport}
${throwingChild}
function Ignore(_props: { child: unknown }) @{ <span /> }
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { <Ignore child={<ThrowingChild />} /> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a catch around ignored component children',
			source: `${typeImport}
${throwingChild}
function Ignore(_props: { children: unknown }) @{ <span /> }
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { <Ignore><ThrowingChild /></Ignore> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a catch around an unused local descriptor',
			source: `${typeImport}
${throwingChild}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { const unused = <ThrowingChild />; <span /> } @catch (_error) { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm around an inert local host descriptor',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { const child = <span />; <div>{child}</div> } @pending { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm around an inert number-typed child',
			source: `${typeImport}
export function Counter({ count$, value }: { count$: SignalHandle<number>; value: number }) @{ @try { <div>{value}</div> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a pending arm around an inert typed local descriptor',
			source: `import type { OctaneNode } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ @try { const child: OctaneNode = <span />; <div>{child}</div> } @pending { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a union-typed inert descriptor in a template boundary',
			source: `import type { OctaneNode } from 'octane';
${typeImport}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const child: OctaneNode | string = <span />; @try { <div>{child}</div> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'an inert createElement host in a template boundary',
			source: `import { createElement } from 'octane';
${typeImport}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const props: { children: string } = { children: 'safe' }; const child = createElement('span', props); @try { <div>{child}</div> } @pending { <output>{String(count$.get())}</output> } }`,
		},
		{
			label: 'a statically dead conditional descriptor alternative',
			source: `${signalValue}
export function Counter(props: { count$: SignalHandle<number> }) { return false ? <SignalValue count$={props.count$} /> : <span />; }`,
		},
		{
			label: 'a pending arm after JavaScript catch intercepts suspension',
			source: `import { use } from 'octane';
${typeImport}
export function Counter(props: { count$: SignalHandle<number>; promise: Promise<string> }) @{ @try { try { use(props.promise); } catch {} <span /> } @pending { <output>{String(props.count$.get())}</output> } }`,
		},
		{
			label: 'a catch after reading an own literal data property',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ try { ({ value: 1 }).value; } catch { props.count$.get(); } <output /> }`,
		},
		{
			label: 'an unreachable nullish fallback',
			source: source.replace(read, `1 ?? ${read}`),
		},
		{
			label: 'an ambiguous receiver',
			source: `${typeImport}
export function Counter(props: { value$: SignalHandle<number> | { get(): number } }) @{
  <output>{String(props.value$.get())}</output>
}`,
		},
		{
			label: 'an ambiguous receiver in a typed child array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> | { get(): number } }) @{ const children: OctaneNode[] = [<SignalValue count$={count$} />]; <div>{children}</div> }`,
		},
		{
			label: 'an ambiguous array element contract',
			source: `${typeImport}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const values: Array<SignalHandle<number> | { get(): number }> = [count$]; <output>{String(values[0].get())}</output> }`,
		},
		{
			label: 'a cleared typed child array',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = [<SignalValue count$={count$} />]; children.length = 0; <div>{children}</div> }`,
		},
		{
			label: 'a replaced typed array child',
			source: `${typedSignalValue}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = [<SignalValue count$={count$} />]; children[0] = null; const size = children.length; <div>{children}</div> }`,
		},
		{
			label: 'an inserted signal child after a throwing child',
			source: `${typedSignalValue}
${throwingChild}
export function Counter({ count$ }: { count$: SignalHandle<number> }) @{ const children: OctaneNode[] = []; children[1] = <SignalValue count$={count$} />; children[0] = <ThrowingChild />; <div>{children}</div> }`,
		},
		{
			label: 'an ordinary getter reached through a recursive type',
			source: `${typeImport}
type Branch = { next: Branch; count$: SignalHandle<number>; cache: { get(): number } };
export function Counter(props: { branch: Branch }) @{ <output>{String(props.branch.next.cache.get())}</output> }`,
		},
		{
			label: 'an ambiguous getter in a recursive union',
			source: recursiveUnion('{ get(): number }'),
		},
		{
			label: 'a similarly named type from another module',
			source: `import type { SignalHandle } from './foreign';
export function Counter(props: { count$: SignalHandle<number> }) @{
  <output>{String(props.count$.get())}</output>
}`,
		},
		{
			label: 'a reassigned ordinary receiver',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number>; fallback: { get(): number } }) @{
  let reader: SignalHandle<number> | { get(): number } = props.count$;
  reader = props.fallback;
  <output>{String(reader.get())}</output>
}`,
		},
		{
			label: 'a pending check with no signal read',
			source: `import type { Scope } from 'octane/signals';
export function Counter(props: { scope: Scope }) @{ <output>{String(props.scope.isPending(() => 123))}</output> }`,
		},
		{
			label: 'a called generator with an unconsumed read',
			source: `${typeImport}
function* readCount$(count$: SignalHandle<number>) { yield count$.get(); }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(Boolean(readCount$(props.count$)))}</output> }`,
		},
		{
			label: 'an asynchronous read after await',
			source: `${typeImport}
async function readCount$(count$: SignalHandle<number>) { await Promise.resolve(); return count$.get(); }
export function Counter(props: { count$: SignalHandle<number> }) @{ <output>{String(Boolean(readCount$(props.count$)))}</output> }`,
		},
		{
			label: 'an uninstantiated instance field',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ class Deferred { value = props.count$.get(); } <output /> }`,
		},
		{
			label: 'a derived field unreachable after a throwing base constructor',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ class Base { constructor() { throw new Error('stop'); } } class Derived extends Base { value = props.count$.get(); } try { new Derived(); } catch {} <output /> }`,
		},
		{
			label: 'a callback on a proven empty handle array',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{ const counts: SignalHandle<number>[] = []; <output>{String(counts.map(() => props.count$.get()))}</output> }`,
		},
		{
			label: 'an array map override that does not invoke its callback',
			source: `${typeImport}
export function Counter(props: { count$: SignalHandle<number> }) @{
  const counts: SignalHandle<number>[] = [props.count$];
  counts.map = () => [];
  <output>{String(counts.map(() => props.count$.get()))}</output>
}`,
		},
	])('accepts $label', ({ source: accepted }) => {
		expect(() => compile(accepted, FILENAME, { dev: true })).not.toThrow();
	});
});

describe('automatic native signal compilation', () => {
	it.each(modes)('accepts CSS keys in logical native style expressions in %j', (options) => {
		for (const expression of [
			'props.open && { left: count$ }',
			'props.style || { left: count$ }',
			'props.style ?? { left: count$ }',
			'(props.open && { left: count$ }) || { right: count$ }',
		]) {
			const source = `${PREFIX}
export function App(props) @{ <div style={${expression}} /> }`;
			expect(() => compile(source, FILENAME, options)).not.toThrow();
		}
		// An object used only as the condition never supplies the host style.
		expect(() =>
			compile(
				`${PREFIX} export function App() @{ <div style={{ left: scope.signal$('offset', 0) } && {}} /> }`,
				FILENAME,
				options,
			),
		).toThrow(NAMING);
	});

	it.each(['universal', 'valdi'])(
		'compiles ordinary $ names on the %s renderer without a signals import',
		(target) => {
			const renderer = { id: 'scene', module: 'scene-runtime', target } as const;
			if (target === 'universal') {
				expect(() => compile(ORDINARY_DOLLAR, FILENAME, { renderer })).not.toThrow();
			}
			expect(() =>
				compile(
					`import $ from 'jquery';
export function App(props) @{
  const tick$ = props.delay;
  const bag = { 'delay$': tick$ };
  <group value={bag['delay$']} reader={props.reader$} library={$} />
}`,
					FILENAME,
					{ renderer },
				),
			).not.toThrow();
		},
	);

	it.each([{ dev: true }, { dev: false, hmr: false }])(
		'keeps the ordinary DOM compile path for $ names in %j',
		(options) => {
			// Keep authored offsets identical: declaration/binding sites encode them.
			const plain = ORDINARY_DOLLAR.replaceAll('tick$', 'tick_');
			const compiled = compile(ORDINARY_DOLLAR, FILENAME, options).code;
			expect(compiled.replaceAll('tick$', 'tick_')).toBe(compile(plain, FILENAME, options).code);
		},
	);

	it.each(modes)('compiles local signals without configuration in %j', (options) => {
		const source = `import { useSignal$ } from 'octane/signals/client';
export function Counter() @{ const count$ = useSignal$(0); <output>{String(count$.get())}</output> }`;
		expect(() => compile(source, FILENAME, options)).not.toThrow();
	});

	it.each(['useSignal$', 'make$'])(
		'slots a plain local-hook module with imported name %s',
		(name) => {
			const source = `import { useSignal$ as ${name} } from 'octane/signals/client';
export function useCounter$() { return ${name}(0); }`;
			const compiler = createOctaneCompiler({ root: '/project' });
			expect(
				compiler.transform(source, '/project/src/use-counter.ts', { dev: true, hmr: true })?.kind,
			).toBe('slots');
		},
	);

	it('checks plain engine modules even when they have no hook import', () => {
		const source = `import { createScope } from 'octane/signals';
const scope = createScope({ scopeKey: 'plain' }); const count = scope.signal$('count', 0);`;
		const compiler = createOctaneCompiler({ root: '/project' });
		expect(() => compiler.transform(source, '/project/src/store.ts')).toThrow(NAMING);
		for (const module of ['octane/signals', 'octane/signals/client', 'octane/signals/server']) {
			expect(() =>
				compiler.transform(
					`import { createResource as resource } from '${module}';
const result = resource(owner, 'result', describe);`,
					'/project/src/resource.ts',
				),
			).toThrow(NAMING);
		}
		const bindingModule = `${PREFIX}
import { adoptBindings as adopt, mountBindings as mount } from 'octane/behavior';
import { View } from './view.tsrx';
let props = { count: count$ };
`;
		for (const dev of [false, true]) {
			for (const setup of [
				`export function activate(root) {
  return adopt(root, View, { getSnapshot: () => props, subscribe() { return () => {}; } });
}`,
				`const source = { getSnapshot() { return props; }, subscribe() { return () => {}; } };
const alias = { ...source };
export function activate(root) { return mount({ parent: root }, View, alias); }`,
			]) {
				for (const extension of ['ts', 'tsrx']) {
					const output = compiler.transform(
						bindingModule + setup,
						'/project/src/controls.' + extension,
						{ dev, hmr: false },
					);
					expect(output?.code).toContain('getSnapshot');
					if (extension === 'tsrx') {
						expect(output?.code).toContain('?octane-bindings=View');
						expect(output?.code).not.toContain('enableNativeReadCollection');
						expect(output?.code).not.toContain('octane/internal/client');
					}
				}
			}
			const activation = `export function activate(root) {
  return adopt(root, View, { getSnapshot: () => props, subscribe() { return () => {}; } });
}`;
			for (const reader of [
				`export function Reader({ value = count$.get() } = {}) @{ <p>{value as string}</p> }`,
				`function Reader({ value = count$.get() } = {}) {
  return createElement('p', null, String(value));
}`,
			]) {
				const output = compiler.transform(
					`${bindingModule}
import { createElement, createRoot } from 'octane';
${reader}
const root = createRoot(document.createElement('div'));
root.render(Reader, {});
${activation}`,
					'/project/src/mixed-controls.tsrx',
					{ dev, hmr: false },
				)!;
				const beforeParameters = output.code.indexOf('_$enableNativeReadCollection(1);');
				expect(beforeParameters).toBeGreaterThan(-1);
				expect(beforeParameters).toBeLessThan(output.code.indexOf('root.render('));
			}
			const component = compiler.transform(
				`${bindingModule}${activation}
export function Reader({ value = count$.get() } = {}) @{ <p>{value as string}</p> }`,
				'/project/src/component-controls.tsrx',
				{ dev, hmr: false },
			)!;
			expect(component.code).toContain('_$enableNativeReadCollection(1);');
			// Only the proven BindingSource protocol property receives the exemption.
			for (const setup of [
				`const unrelated = { getSnapshot: () => props };`,
				`export function activate(adopt, root) {
  return adopt(root, View, { getSnapshot: () => props, subscribe() { return () => {}; } });
}`,
				`export function activate(root) {
  return adopt(root, { getSnapshot: () => props }, {});
}`,
				`export function activate(root) {
  return adopt(root, View, { getSnapshot: () => props, peek: () => props, subscribe() { return () => {}; } });
}`,
				`const getSnapshot = () => props;
export function activate(root) {
  return adopt(root, View, { getSnapshot, subscribe() { return () => {}; } });
}`,
			])
				expect(() =>
					compiler.transform(bindingModule + setup, '/project/src/controls.ts', {
						dev,
						hmr: false,
					}),
				).toThrow(NAMING);
		}
	});

	it('checks runtime capabilities alongside inline type imports', () => {
		const source = `import { type Scope, createScope } from 'octane/signals';
const scope: Scope = createScope();
const count = scope.signal$('count', 0);`;
		expect(() => compile(app('', source), FILENAME)).toThrow(NAMING);
	});

	it('leaves data-only modules free of renderer initialization, including type imports', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const source = `import type { OctaneNode } from 'octane';
import { createScope } from 'octane/signals';
const scope = createScope({ scopeKey: 'plain' });
export const value$ = scope.signal$('value', 0);`;
		expect(compiler.transform(source, '/project/src/store.ts')).toMatchObject({
			code: source,
			kind: 'none',
		});
	});

	it('slots plain local hooks without configuration', () => {
		const source = `import { useSignal$ } from 'octane/signals/client';
export function useCounter$() { return useSignal$(0); }`;
		const compiler = createOctaneCompiler({ root: '/project' });
		expect(compiler.transform(source, '/project/src/use-counter.ts')?.kind).toBe('slots');
		expect(slotHooks(source, '/project/src/use-counter.ts')).not.toBeNull();
	});

	it.each(['universal', 'valdi'])('rejects the unsupported %s host', (target) => {
		expect(() =>
			compile(app(''), FILENAME, {
				renderer: { id: 'other', module: 'other-renderer', target } as any,
			}),
		).toThrow(/native signal reads.*DOM/);
	});

	it.each([
		`import type { Scope } from 'octane/signals';`,
		`import { type Scope } from 'octane/signals';`,
		`import type { Scope as Scope$ } from 'octane/signals';`,
		`import { type useSignal$ } from 'octane/signals/client';`,
		`import { type Scope as Scope$ } from 'octane/signals';`,
		`export type Scope$ = import('octane/signals').Scope;`,
	])('allows non-DOM components with only signal types: %s', (types) => {
		for (const dev of [false, true]) {
			for (const component of [
				'export function App() @{ <group /> }',
				'export function App() { return <group />; }',
				'export function App(props) @{ const tick$ = props.value; <group value={tick$} /> }',
			]) {
				const source = `${types}\n${component}`;
				const options = {
					dev,
					hmr: false,
					renderer: { id: 'scene', module: 'scene-runtime', target: 'universal' as const },
				};
				expect(() => compile(source, FILENAME, options)).not.toThrow();
				expect(
					compileToVolarMappings(source, FILENAME, {
						renderers: {
							registry: { scene: { module: 'scene-runtime', target: 'universal' } },
							rules: [{ include: '**/*.tsrx', renderer: 'scene' }],
						},
					}).diagnostics,
				).toEqual([]);
			}
		}
	});

	it('rejects an active non-DOM renderer boundary inside a DOM module', () => {
		const source = `import 'octane/signals';
import { Canvas } from '@scene/bridge';
export function App(props) @{ <Canvas><mesh value={props.value$.get()} /></Canvas> }`;
		expect(() =>
			compile(source, FILENAME, {
				rendererBoundaries: {
					'@scene/bridge': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'scene',
							prop: 'children',
						},
					},
				},
				rendererRegistry: { scene: { target: 'universal', module: 'scene-runtime' } },
			}),
		).toThrow('OCTANE_NATIVE_READ_TARGET');
	});

	it('rejects a deferred local derived hook with explicit-owner guidance', () => {
		const source = `import { useDerived$ } from 'octane/signals/client';
export function App() @{ <div /> }`;
		expect(() => compile(source, FILENAME, {})).toThrow(/useDerived\$.*explicitly owned Scope/);
	});
});

describe('native signal capability names', () => {
	it.each([
		['created handles', `const count = scope.signal$('draft-title', 1);`],
		['handle factories', 'function createCount() { return count$; }'],
		['aggregate factories', 'function makeCounter() { return { count$ }; }'],
		['arrow factories', 'const createCount = () => count$;'],
		['live accessor functions', 'function readCount() { return scope.get(count$); }'],
		['live accessor arrows', 'const readCount = () => scope.get(count$);'],
	])('rejects missing suffixes on %s', (_label, setup) => {
		expect(() => compile(app(setup), FILENAME, {})).toThrow(NAMING);
	});

	it.each([
		[
			'imported scope factory aliases',
			`import { createScope as makeScope } from 'octane/signals';
const otherScope = makeScope();
const count = otherScope.signal$('other', 0);`,
		],
		[
			'namespace scope imports',
			`import * as signals from 'octane/signals';
const otherScope = signals.createScope();
const count = otherScope.signal$('other', 0);`,
		],
		[
			'imported resource factories',
			`import { createResource } from 'octane/signals';
const result = createResource(scope, 'result', describe);`,
		],
		[
			'imported resource factory aliases',
			`import { createResource as resource } from 'octane/signals';
const result = resource(scope, 'result', describe);`,
		],
		[
			'namespace resource imports',
			`import * as signals from 'octane/signals';
const result = signals.createResource(scope, 'result', describe);`,
		],
	])('rejects missing suffixes through %s', (_label, module) => {
		expect(() => compile(app('', PREFIX + module), FILENAME, {})).toThrow(NAMING);
	});

	it('allows handles and factories to pass through ordinary alias and prop names', () => {
		const source = app(
			`
const alias = count$;
const { count$: count } = { count$ };
const [item] = [count$];
const bag = { count: count$ };
bag.count = count$;
function readCount$() { return scope.get(count$); }
const read = readCount$;
function read$(value) { return scope.get(value); }
`,
			`${PREFIX}\nexport { count$ as exportedCount };`,
		);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});

	it('allows imported capability factories to use ordinary local aliases', () => {
		const source = app(
			'',
			`${PREFIX}
import { useSignal$ as useSignal } from 'octane/signals/client';`,
		);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});

	it('accepts suffixed capabilities, ordinary snapshots, durable keys, and commands', () => {
		const source = app(`
const alias$ = count$;
const { count$: counter$ } = { count$ };
const [other$] = [alias$];
const values = new Map([['ordinary-data-key', counter$]]);
const durable$ = scope.signal$('draft-title', 0);
function createCounter$() { return { count$: durable$ }; }
function readCount$() { return scope.get(count$); }
const value = scope.get(count$);
const snapshot = count$.snapshot();
const latest = count$.latest(0);
function increment() { scope.set(count$, value + 1); }
const reset = () => scope.set(count$, 0);
`);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});

	it('does not give shadowed or unrelated APIs native semantics', () => {
		const source = app(
			`
const unrelated = { signal$(value) { return value; }, get(value) { return value; } };
const result = unrelated.signal$(1);
function shadowResource(createResource) {
  const value = createResource(scope, 'field', () => 1);
  return value;
}
function shadow(createScope) {
  const scope = createScope();
  const value = scope.signal$('field', 1);
  return value;
}
`,
			`${PREFIX}\nimport { createResource } from 'octane/signals';`,
		);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});

	it.each(modes)('reports the authored binding in %j', (options) => {
		const source = app("const wrong = scope.signal$('wrong', 0);");
		const start = source.indexOf('wrong');
		let diagnostic: any;
		try {
			compile(source, FILENAME, { ...options });
		} catch (error) {
			diagnostic = (error as any).diagnostic;
		}
		expect(diagnostic).toMatchObject({
			code: NAMING,
			severity: 'error',
			start: { offset: start },
			end: { offset: start + 5 },
		});
		const editor = compileToVolarMappings(source, FILENAME, {});
		expect(editor.diagnostics).toContainEqual(diagnostic);
	});
});

describe('native reads and ordinary hook dependencies', () => {
	it.each([', []', ', [count$]'])('diagnoses a live read in useMemo%s', (deps) => {
		const source = app(
			`const value = useMemo(() => scope.get(count$)${deps});`,
			`import { useMemo } from 'octane';\n${PREFIX}`,
		);
		for (const options of modes)
			expect(() => compile(source, FILENAME, options)).toThrow(MEMO_READ);
		for (const [imported, factory] of [
			['{ createResource }', 'createResource'],
			['{ createResource as resource }', 'resource'],
			['* as signals', 'signals.createResource'],
		]) {
			const resource = app(
				`const value = memo(() => result$.get(), []);`,
				`import { useMemo as memo } from 'octane';
import ${imported} from 'octane/signals';
const result$ = ${factory}(owner, 'result', describe);`,
			);
			for (const options of modes)
				expect(() => compile(resource, FILENAME, options)).toThrow(MEMO_READ);
		}
	});

	it('diagnoses a helper read and a memo import alias without relying on dollar spelling', () => {
		const source = app(
			`const value = memo(readCount$, []);`,
			`
import { useMemo as memo } from 'octane';
${PREFIX}
function readCount$() { return scope.get(count$); }
`,
		);
		expect(() => compile(source, FILENAME, {})).toThrow(MEMO_READ);
	});

	it.each(modes)('accepts inferred native memo reads in %j', (options) => {
		const source = app(
			`const value = useMemo(() => scope.get(count$));
const alias = memo(readCount$);
const namespace = Octane.useMemo(() => count$.latest(0));`,
			`import { useMemo, useMemo as memo } from 'octane';
import * as Octane from 'octane';
${PREFIX}
function readCount$() { return scope.get(count$); }`,
		);
		expect(() => compile(source, FILENAME, { ...options })).not.toThrow();
	});

	it('diagnoses a live read inside a memoized JSX result', () => {
		const source = app(
			'const value = useMemo(() => <span>{count$.get() as string}</span>, []);',
			`import { useMemo } from 'octane';\n${PREFIX}`,
		);
		expect(() => compile(source, FILENAME, {})).toThrow(MEMO_READ);
	});

	it('keeps sampled dependencies and effect callbacks under their ordinary contract', () => {
		const source = app(
			`
const count = scope.get(count$);
const value = useMemo(() => count, [count]);
const once = useMemo(() => count, []);
const inferred = useMemo(() => count);
const always = useMemo(() => count, null);
const liveEveryRender = useMemo(() => scope.get(count$), null);
useEffect(() => { console.log(scope.get(count$)); }, []);
`,
			`import { useMemo, useEffect } from 'octane';\n${PREFIX}`,
		);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});

	it('does not classify a shadowed useMemo as an Octane hook', () => {
		const source = app(`
const useMemo = (callback) => callback();
const value = useMemo(() => scope.get(count$));
`);
		expect(() => compile(source, FILENAME, {})).not.toThrow();
	});
});

describe('native-read AST ownership', () => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	afterEach(() => {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	});

	it.each(modes)('does not mutate a frozen parser tree in %j', (options) => {
		const source = `${PREFIX}
import { signal$ } from 'octane/signals';
const nested$ = signal$(signal$(2));
function readCount$() { return scope.get(count$); }
export function App(props) @{
  const value = readCount$();
  <ul>
    @for (const item of props.items; key item.id) {
      @if (item.visible) {
        <li>{(value + item.label) as string}</li>
      }
    }
  </ul>
}`;
		process.env.OCTANE_COMPILE_FROZEN_AST = '1';
		const frozen = compile(source, FILENAME, { ...options });
		delete process.env.OCTANE_COMPILE_FROZEN_AST;
		const ordinary = compile(source, FILENAME, { ...options });
		expect(frozen.code).toBe(ordinary.code);
		expect(frozen.map).toEqual(ordinary.map);
	});
});
