import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { openHostStatePage } from './harness.js';

let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

it.each(['text', 'radio'])(
	'restores the owning radio group despite a %s ID collision',
	async (collisionType) => {
		const page = await openHostStatePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
		try {
			const observed = await page.evaluate(async (collisionType) => {
				const {
					createRoot,
					createElement: h,
					flushSync,
					act,
					startTransition,
					requestFormReset,
				} = window.OctaneHost;
				const host = document.createElement('div');
				document.body.append(host);
				const root = createRoot(host);
				const radio = (id: string, form: string | undefined, checked: boolean) =>
					h('input', { id, type: 'radio', name: 'choice', form, checked, readOnly: true });
				const tree = (external: boolean) =>
					h(
						'div',
						{},
						h(
							'form',
							{ id: 'radio-owner' },
							radio('inside', undefined, !external),
							h('input', {
								id: 'choice',
								type: collisionType,
								name: 'independent',
								checked: true,
								defaultValue: 'collision',
								readOnly: true,
							}),
						),
						h('form', {}, radio('other-owner', undefined, true)),
						radio('external', 'radio-owner', external),
						radio('formless', undefined, true),
					);
				flushSync(() => root.render(tree(false)));
				const nodes = [...host.querySelectorAll('input')];
				flushSync(() => root.render(tree(true)));
				(host.querySelector('#inside') as HTMLInputElement).click();
				const afterEvent = nodes.map((node) => node.checked);
				await act(() => startTransition(() => requestFormReset(host.querySelector('form')!)));
				const afterReset = nodes.map((node) => node.checked);
				const identity = nodes.every((node, i) => node === host.querySelectorAll('input')[i]);
				const value = (host.querySelector('#choice') as HTMLInputElement).value;
				root.unmount();
				host.remove();
				return { afterEvent, afterReset, identity, value };
			}, collisionType);
			expect(observed).toEqual({
				afterEvent: [false, true, true, true, true],
				afterReset: [false, true, true, true, true],
				identity: true,
				value: 'collision',
			});
		} finally {
			await page.close();
		}
	},
);

it('restores an uncontrolled external cousin through a held root update', async () => {
	const page = await openHostStatePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(async () => {
			const { createRoot, createElement: h, flushSync, act, use } = window.OctaneHost;
			const host = document.createElement('div');
			document.body.append(host);
			const root = createRoot(host);
			let resolve!: (value: string) => void;
			const pending = new Promise<string>((done) => {
				resolve = done;
			});
			const ready = { status: 'fulfilled', value: 'ready', then() {} };
			function Reader({ value }: { value: unknown }) {
				return h('span', {}, use(value as Promise<string>));
			}
			const tree = (checked: boolean, value: unknown) =>
				h(
					'div',
					{},
					h(
						'form',
						{ id: 'held-owner' },
						h('input', {
							id: 'controlled',
							type: 'radio',
							name: 'held-choice',
							checked,
							readOnly: true,
						}),
					),
					h('input', {
						id: 'uncontrolled',
						type: 'radio',
						form: 'held-owner',
						name: 'held-choice',
						defaultChecked: true,
					}),
					h(Reader, { value }),
				);
			flushSync(() => root.render(tree(false, ready)));
			const nodes = [...host.querySelectorAll('input')];
			flushSync(() => root.render(tree(true, pending)));
			const held = nodes.map((node) => node.checked);
			await act(() => resolve('resolved'));
			const resolved = nodes.map((node) => node.checked);
			const identity = nodes.every((node, i) => node === host.querySelectorAll('input')[i]);
			root.unmount();
			host.remove();
			return { held, resolved, identity };
		});
		expect(observed).toEqual({ held: [false, true], resolved: [true, false], identity: true });
	} finally {
		await page.close();
	}
});
