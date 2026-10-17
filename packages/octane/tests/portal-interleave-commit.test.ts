import { describe, expect, it } from 'vitest';
import { loadCompiledFixtureSource } from './_server-fixture';
import { createRoot, flushSync } from '../src/index.js';

// A portal whose Fragment ref shares its target with a later, independent
// portal grows its range around that portal's when its Fragment gains a child.
// The render that grows it writes none of the target (#2043): the move lands
// at commit, before the new child it makes room for.
const SOURCE = `
import { Fragment, createPortal } from 'octane';
function Probe(props) @{
	props.probe();
	<></>
}
function Owned(props) @{
	<Fragment>
		{createPortal(
			<Fragment ref={props.fragRef}>
				<button id="owned-first" type="button">{'first'}</button>
				@if (props.showLate) {
					<button id="owned-late" type="button">{'late'}</button>
				}
			</Fragment>,
			props.target,
		)}
	</Fragment>
}
function Independent(props) {
	return createPortal(<button id="independent" type="button">{'independent'}</button>, props.target);
}
export function App(props) @{
	<Fragment>
		<Owned {...props} />
		<Independent {...props} />
		<Probe probe={props.probe} />
	</Fragment>
}
`;

describe.each([false, true])('an interleaved Fragment portal (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: `portal-interleave-commit-${dev}.tsrx`,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	it('grows around a shared target’s later portal at commit', () => {
		const container = document.createElement('div');
		const target = document.createElement('section');
		document.body.append(container, target);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		const during: MutationRecord[][] = [];
		let armed = false;
		const probe = () => {
			if (armed) during.push(observer.takeRecords());
		};
		const props = { fragRef: { current: null }, target, showLate: false, probe };
		try {
			flushSync(() => root.render(client.App, props));
			const independent = target.querySelector('#independent');
			observer.observe(target, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
			});
			armed = true;
			flushSync(() => root.render(client.App, { ...props, showLate: true }));
			expect(during.length).toBeGreaterThan(0);
			for (const records of during) expect(records).toEqual([]);
			expect([...target.querySelectorAll('button')].map((node) => node.id)).toEqual([
				'owned-first',
				'independent',
				'owned-late',
			]);
			expect(target.querySelector('#independent')).toBe(independent);
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
			target.remove();
		}
	});
});
