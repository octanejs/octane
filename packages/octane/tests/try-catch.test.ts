import { describe, it, expect } from 'vitest';
import { flushSync, startTransition } from '../src/index.js';
import { act, mount, nextPaint } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { RenderBoundary, EffectBoundary, Nested, StatefulInside } from './_fixtures/try-catch.tsrx';

describe('tryBlock — render errors', () => {
	it('catches a child render error and shows the fallback', () => {
		const r = mount(RenderBoundary, { bang: true });
		expect(r.findAll('.ok')).toHaveLength(0);
		expect(r.find('.caught .msg').textContent).toBe('render boom');
		r.unmount();
	});

	it('renders the try body when the child does not throw', () => {
		const r = mount(RenderBoundary, { bang: false });
		expect(r.find('.ok').textContent).toBe('rendered');
		expect(r.findAll('.caught')).toHaveLength(0);
		r.unmount();
	});

	it('reset() re-attempts the try body', () => {
		const r = mount(RenderBoundary, { bang: true });
		expect(r.find('.caught .msg').textContent).toBe('render boom');
		// Make subsequent renders safe, then click reset.
		r.update(RenderBoundary, { bang: false });
		// Still in catch (props update doesn't auto-retry — reset does).
		r.click('.caught button');
		expect(r.find('.ok').textContent).toBe('rendered');
		expect(r.findAll('.caught')).toHaveLength(0);
		r.unmount();
	});
});

describe('tryBlock — effect errors', () => {
	it('catches an effect throw and swaps to fallback', async () => {
		const r = mount(EffectBoundary, { bang: false });
		expect(r.find('.ok').textContent).toBe('ok-for-now');

		// Trigger the effect to throw on the next render.
		r.update(EffectBoundary, { bang: true });
		// Effect bodies run after paint — wait.
		await nextPaint();
		expect(r.findAll('.ok')).toHaveLength(0);
		expect(r.find('.caught .msg').textContent).toBe('effect boom');
		r.unmount();
	});
});

describe('tryBlock — nesting', () => {
	it('inner boundary catches its own subtree before outer sees it', () => {
		const r = mount(Nested);
		expect(r.find('.inner-msg').textContent).toBe('inner: always');
		expect(r.findAll('.outer-msg')).toHaveLength(0);
		expect(r.find('.outer')).not.toBeNull(); // outer still rendered fine
		r.unmount();
	});
});

describe('tryBlock — stateful try body', () => {
	it('does not switch to catch on state-only re-renders', () => {
		const r = mount(StatefulInside);
		expect(r.find('button').textContent).toBe('0');
		r.click('#inc');
		r.click('#inc');
		expect(r.find('button').textContent).toBe('2');
		expect(r.findAll('.caught')).toHaveLength(0);
		r.unmount();
	});
});

// A parent render can rebuild a JSX ErrorBoundary's fallback and then roll back
// because a later sibling suspends the root. A descendant that throws afterwards
// must get the fallback the committed render described, not the abandoned one.
const ROLLED_BACK_CATCH = `
import { ErrorBoundary, use, useState } from 'octane';
function Gate(props) @{ if (props.gate) use(props.gate); <u>{'gate'}</u> }
function Fails(props) @{
  const [failed, setFailed] = useState(false);
  props.controls.fail = () => setFailed(true);
  if (failed) throw new Error('boom');
  <q>{'ok'}</q>
}
export function ElementApp(props) @{
  <main>
    <b>{props.selection as string}</b>
    <ErrorBoundary fallback={<p>{('caught ' + props.selection) as string}</p>}>
      <Fails controls={props.controls} />
    </ErrorBoundary>
    <Gate gate={props.gate} />
  </main>
}
export function RenderPropApp(props) @{
  <main>
    <b>{props.selection as string}</b>
    <ErrorBoundary fallback={(error) => <p>{(error.message + ' ' + props.selection) as string}</p>}>
      <Fails controls={props.controls} />
    </ErrorBoundary>
    <Gate gate={props.gate} />
  </main>
}
`;

describe.each([false, true])('ErrorBoundary after a rolled-back root render (dev=%s)', (dev) => {
	const { ElementApp, RenderPropApp } = loadCompiledFixtureSource<
		Record<'ElementApp' | 'RenderPropApp', any>
	>(ROLLED_BACK_CATCH, {
		id: `/src/rolled-back-catch-${dev ? 'dev' : 'prod'}.tsrx`,
		mode: 'client',
		compileOptions: { strong: true, dev, hmr: false },
	});
	const never = () => new Promise<never>(() => {});
	const fallbacks = [
		['element', ElementApp, 'caught'],
		['render-prop', RenderPropApp, 'boom'],
	] as const;

	describe.each(fallbacks)('%s fallback', (_name, App, prefix) => {
		const fallback = (root: ReturnType<typeof mount>) =>
			root.findAll('p').map((node) => node.textContent);

		it('builds the fallback from the committed props', () => {
			const controls = {} as { fail(): void };
			const root = mount(App, { selection: 'A', controls });
			try {
				root.update(App, { selection: 'X', gate: never(), controls });
				expect(root.find('b').textContent).toBe('A');

				flushSync(() => controls.fail());
				expect(root.findAll('q')).toHaveLength(0);
				expect(fallback(root)).toEqual([`${prefix} A`]);
			} finally {
				root.unmount();
			}
		});

		it('builds the fallback from the committed props after a suspended transition', async () => {
			const controls = {} as { fail(): void };
			const root = mount(App, { selection: 'A', controls });
			try {
				startTransition(() => root.update(App, { selection: 'X', gate: never(), controls }));
				await act(() => {});
				expect(root.find('b').textContent).toBe('A');

				flushSync(() => controls.fail());
				expect(fallback(root)).toEqual([`${prefix} A`]);
			} finally {
				root.unmount();
			}
		});

		it('builds the fallback from a later commit', () => {
			const controls = {} as { fail(): void };
			const root = mount(App, { selection: 'A', controls });
			try {
				root.update(App, { selection: 'X', gate: never(), controls });
				root.update(App, { selection: 'C', controls });
				expect(root.find('b').textContent).toBe('C');

				flushSync(() => controls.fail());
				expect(fallback(root)).toEqual([`${prefix} C`]);
			} finally {
				root.unmount();
			}
		});
	});
});
