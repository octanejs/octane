import { describe, expect, it, vi } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers';
import {
	HiddenStyleApp,
	HiddenStyleErrorApp,
	type HiddenStyleProps,
} from './_fixtures/style-hidden-commit.tsrx';

// Render computes, commit writes (#2043): an authored style update to a host
// that Activity or a Suspense fallback hides reaches the host at commit, under
// the hide, and a render that never commits writes nothing.

type Priority = 'urgent' | 'transition';

const INITIAL = { prefix: { opacity: 0.5 }, color: 'red' };
const UPDATED = { prefix: { display: 'flex', opacity: 1 }, color: 'blue' };
const REVEALED = { prefix: { display: 'grid', opacity: 0.25 }, color: 'green' };

function setup() {
	// Every record the document produces, delivered or still queued.
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((batch) => records.push(...batch));
	const mutations = () => {
		records.push(...observer.takeRecords());
		return records.splice(0);
	};
	let during: MutationRecord[] | null = null;
	const props: HiddenStyleProps = {
		hidden: true,
		...INITIAL,
		probe: () => {
			during = mutations();
		},
	};
	const app = mount(HiddenStyleApp, props);
	const hosts = () => app.findAll('#activity, #suspense') as HTMLElement[];
	// The update keeps both hosts, hidden or revealed, rather than replacing them.
	const expectHosts = (expected: HTMLElement[]) => {
		const current = hosts();
		expect(current).toHaveLength(expected.length);
		current.forEach((host, i) => expect(host).toBe(expected[i]));
	};
	const render = async (next: Partial<HiddenStyleProps>, priority: Priority = 'urgent') => {
		mutations();
		during = null;
		await act(() => {
			const update = () => app.root.render(HiddenStyleApp, { ...props, ...next });
			if (priority === 'transition') startTransition(update);
			else update();
		});
		return during;
	};
	return { app, expectHosts, hosts, mutations, observer, render };
}

const styles = (hosts: HTMLElement[]) =>
	hosts.map(({ style }) => [
		style.getPropertyValue('display'),
		style.getPropertyPriority('display'),
		style.color,
		style.opacity,
	]);

describe('a hidden host takes its style update at commit', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		it(`writes nothing while it renders, then lands under the hide (${priority})`, async () => {
			const { app, expectHosts, hosts, observer, render } = setup();
			const pending = new Promise(() => {});
			try {
				// The Suspense primary resolved once; its update suspends behind the fallback.
				await render({ pending });
				expect(app.find('p').textContent).toBe('pending');
				const [activity, suspense] = hosts();
				expect(styles([activity, suspense])).toEqual([
					['none', 'important', 'red', '0.5'],
					['none', 'important', 'red', '0.5'],
				]);
				observer.observe(document, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});

				expect(await render({ pending, ...UPDATED }, priority)).toEqual([]);
				expectHosts([activity, suspense]);
				expect(styles([activity, suspense])).toEqual([
					['none', 'important', 'blue', '1'],
					['none', 'important', 'blue', '1'],
				]);

				// A reveal that changes the style again writes it after the hide lifts.
				expect(await render({ hidden: false, ...REVEALED })).toEqual([]);
				expectHosts([activity, suspense]);
				expect(styles([activity, suspense])).toEqual([
					['grid', '', 'green', '0.25'],
					['grid', '', 'green', '0.25'],
				]);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});

		it(`a dropped ${priority} render writes nothing to a hidden host`, async () => {
			const { app, expectHosts, hosts, mutations, observer, render } = setup();
			const pending = new Promise(() => {});
			try {
				await render({ pending });
				const [activity, suspense] = hosts();
				observer.observe(document, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});

				// A sibling outside every boundary suspends: the root keeps its screen.
				const gate = new Promise(() => {});
				expect(await render({ pending, ...UPDATED, gate }, priority)).toEqual([]);
				expect(mutations()).toEqual([]);

				// Revealing with the committed style writes none: the hosts show it as
				// the dropped render left them.
				await render({ hidden: false, ...INITIAL });
				expectHosts([activity, suspense]);
				expect(styles([activity, suspense])).toEqual([
					['', '', 'red', '0.5'],
					['', '', 'red', '0.5'],
				]);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});
	}
});

it("a hidden host's style write that fails at commit reaches the nearest boundary", async () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const app = mount(HiddenStyleErrorApp, { prefix: { opacity: 0.5 }, color: 'red' });
	try {
		const host = app.find('#activity') as HTMLElement;
		expect(host.style.display).toBe('none');
		const color = {
			toString(): string {
				throw new Error('uncoercible color');
			},
		} as unknown as string;
		await act(() => app.root.render(HiddenStyleErrorApp, { prefix: { opacity: 1 }, color }));
		expect(app.find('#caught').textContent).toBe('uncoercible color');
		expect(host.isConnected).toBe(false);
	} finally {
		app.unmount();
		error.mockRestore();
	}
});
