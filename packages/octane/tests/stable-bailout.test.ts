import { describe, expect, it } from 'vitest';
import { lazy } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// `$$stable` is the compiler-emitted definition-site purity stamp: a stamped
// component's committed output is a pure projection of its props snapshot, so
// the runtime may keep that subtree when a parent hands it shallow-equal props
// — React.memo's bailout without the wrapper. These tests observe the bail
// through effect/callback evidence (a skipped render never runs its body or
// effects) and through DOM, never through the marker itself.
const compileClient = (source: string, id: string) =>
	loadCompiledFixtureSource(source, {
		id,
		mode: 'client',
		compileOptions: { hmr: false, dev: false },
	});

describe('compiler-stable component bailout', () => {
	it('skips the body and deferred effects on a shallow-equal props update', () => {
		const source = `
			import { useEffect, useState } from 'octane';
			function Stable(props) @{
				useEffect(() => {
					props.onRender();
				}, null);
				<div>{props.label as string}</div>
			}
			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="tick" onClick={() => setTick(tick + 1)}>{'' + tick}</button>
					<Stable label="fixed" onRender={props.onRender} />
				</section>
			}
		`;
		const client = compileClient(source, 'stable-equal-props.tsrx');
		const renders: string[] = [];
		const root = mount(client.App, { onRender: () => renders.push('render') });
		flushEffects();
		expect(renders).toEqual(['render']);
		expect(root.find('div').textContent).toBe('fixed');

		root.click('#tick');
		flushEffects();
		expect(root.find('#tick').textContent).toBe('1');
		expect(renders).toEqual(['render']);
		root.unmount();
	});

	it('re-renders with fresh effects when props actually change', () => {
		const source = `
			import { useEffect, useState } from 'octane';
			function Stable(props) @{
				useEffect(() => {
					props.onRender(props.label);
					return () => props.onCleanup(props.label);
				}, null);
				<div>{props.label as string}</div>
			}
			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="bail" onClick={() => setTick(tick === 0 ? 1 : tick)}>{'bail'}</button>
					<button id="change" onClick={() => setTick(2)}>{'change'}</button>
					<Stable label={tick === 2 ? 'changed' : 'fixed'} onRender={props.onRender} onCleanup={props.onCleanup} />
				</section>
			}
		`;
		const client = compileClient(source, 'stable-changed-props.tsrx');
		const log: string[] = [];
		const root = mount(client.App, {
			onRender: (label: string) => log.push('render:' + label),
			onCleanup: (label: string) => log.push('cleanup:' + label),
		});
		flushEffects();
		expect(log).toEqual(['render:fixed']);

		root.click('#bail');
		flushEffects();
		expect(log).toEqual(['render:fixed']);

		root.click('#change');
		flushEffects();
		expect(log).toEqual(['render:fixed', 'cleanup:fixed', 'render:changed']);
		expect(root.find('div').textContent).toBe('changed');
		root.unmount();
	});

	it('does not interfere with the component own self-driven updates', () => {
		const source = `
			import { useEffect, useState } from 'octane';
			function Stable(props) @{
				const [n, setN] = useState(0);
				useEffect(() => {
					props.onRender(n);
				}, null);
				<div><button id="inc" onClick={() => setN(n + 1)}>{'' + n}</button></div>
			}
			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="tick" onClick={() => setTick(tick + 1)}>{'' + tick}</button>
					<Stable onRender={props.onRender} />
				</section>
			}
		`;
		const client = compileClient(source, 'stable-self-update.tsrx');
		const renders: number[] = [];
		const root = mount(client.App, { onRender: (n: number) => renders.push(n) });
		flushEffects();
		expect(renders).toEqual([0]);

		root.click('#inc');
		flushEffects();
		expect(root.find('#inc').textContent).toBe('1');
		expect(renders).toEqual([0, 1]);

		// A parent bail afterwards leaves the self-rendered state alone.
		root.click('#tick');
		flushEffects();
		expect(root.find('#inc').textContent).toBe('1');
		expect(renders).toEqual([0, 1]);
		root.unmount();
	});

	it('refreshes a context consumer below a bailed stable boundary without re-running it', () => {
		const source = `
			import { createContext, useContext, useEffect, useState } from 'octane';
			const Ctx = createContext(0);
			function Consumer() @{
				const v = useContext(Ctx);
				<span id="c">{'' + v}</span>
			}
			function Stable(props) @{
				useEffect(() => {
					props.onRender();
				}, null);
				<div><Consumer /></div>
			}
			function Provider(props) @{
				const [v, setV] = useState(0);
				<Ctx value={v}>
					<Stable onRender={props.onRender} />
					<button id="bump" onClick={() => setV(v + 1)}>{'' + v}</button>
				</Ctx>
			}
			export function App(props) @{
				<Provider onRender={props.onRender} />
			}
		`;
		const client = compileClient(source, 'stable-context-passthrough.tsrx');
		const renders: string[] = [];
		const root = mount(client.App, { onRender: () => renders.push('stable') });
		flushEffects();
		expect(root.find('#c').textContent).toBe('0');
		expect(renders).toEqual(['stable']);

		root.click('#bump');
		flushEffects();
		// The provider's value change reaches the consumer beneath the bailed
		// boundary; the boundary body never re-ran.
		expect(root.find('#c').textContent).toBe('1');
		expect(renders).toEqual(['stable']);
		root.unmount();
	});

	it('bails a stable component mounted in value (children) position', () => {
		const source = `
			import { useEffect, useState } from 'octane';
			function Stable(props) @{
				useEffect(() => {
					props.onRender();
				}, null);
				<div id="slot">{props.label as string}</div>
			}
			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="tick" onClick={() => setTick(tick + 1)}>{'' + tick}</button>
					{<Stable label="fixed" onRender={props.onRender} />}
				</section>
			}
		`;
		const client = compileClient(source, 'stable-value-position.tsrx');
		const renders: string[] = [];
		const root = mount(client.App, { onRender: () => renders.push('render') });
		flushEffects();
		expect(renders).toEqual(['render']);

		root.click('#tick');
		flushEffects();
		expect(renders).toEqual(['render']);
		expect(root.find('#slot').textContent).toBe('fixed');
		root.unmount();
	});

	it('bails a lazy()-wrapped stable component once the module resolves', async () => {
		const source = `
			import { useEffect } from 'octane';
			export function Stable(props) @{
				useEffect(() => {
					props.onRender();
				}, null);
				<div id="lazy-body">{props.label as string}</div>
			}
			export function Host(props) @{
				const C = props.comp;
				@try {
					<section>
						<span id="t">{'' + props.tick}</span>
						<C label="fixed" onRender={props.onRender} />
					</section>
				} @pending {
					<span id="pending">{'loading'}</span>
				}
			}
		`;
		const client = compileClient(source, 'stable-lazy-target.tsrx');
		const renders: string[] = [];
		const LazyStable = lazy(() => Promise.resolve({ default: client.Stable }));
		const onRender = () => renders.push('render');

		const root = mount(client.Host, { comp: LazyStable, onRender, tick: 0 });
		expect(root.find('#pending').textContent).toBe('loading');
		await act(async () => {});
		flushEffects();
		expect(root.find('#lazy-body').textContent).toBe('fixed');
		expect(renders).toEqual(['render']);

		// The host re-renders (changed tick) while the lazy child sees shallow-equal
		// props: the resolved stable body's installed metadata keeps it — no re-run.
		root.update(client.Host, { comp: LazyStable, onRender, tick: 1 });
		flushEffects();
		expect(root.find('#t').textContent).toBe('1');
		expect(renders).toEqual(['render']);
		root.unmount();
	});
});
