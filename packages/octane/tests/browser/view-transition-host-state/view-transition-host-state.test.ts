import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { openStagePage } from './harness.js';

let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

it('reads committed scroll geometry until queued scrolling is published', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			const host = document.createElement('div');
			host.style.cssText = 'width:100px;height:100px;overflow:scroll';
			host.innerHTML = '<div style="height:1000px;width:1000px">content</div>';
			document.body.appendChild(host);
			host.scrollTop = 120;
			host.scrollLeft = 80;
			const stage = new window.OctaneStage.DOMStage();
			const prepared = stage.view(host);
			prepared.scrollTop = 480;
			prepared.scrollLeft = 360;
			const before = [host.scrollTop, host.scrollLeft, prepared.scrollTop, prepared.scrollLeft];
			stage.commit();
			return { before, after: [host.scrollTop, host.scrollLeft] };
		});
		expect(observed.before).toEqual([120, 80, 120, 80]);
		expect(observed.after).toEqual([480, 360]);
	} finally {
		await page.close();
	}
});

it('keeps an external radio associated with the original form through projected changes', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			document.body.innerHTML =
				'<form id="owner"><input type="radio" name="choice" checked></form><input type="radio" name="choice" form="owner">';
			const form = document.querySelector('form')!;
			const first = form.querySelector('input')!;
			const external = document.body.lastElementChild as HTMLInputElement;
			const stage = new window.OctaneStage.DOMStage();
			stage.view(external).checked = true;
			const prepared = {
				owner: stage.view(external).form === form,
				members: [...stage.view(form).elements].every(
					(node, index) => node === [first, external][index],
				),
				selected: [stage.view(first).checked, stage.view(external).checked],
			};
			const before = [first.checked, external.checked];
			stage.commit();
			return { prepared, before, after: [first.checked, external.checked] };
		});
		expect(observed).toEqual({
			prepared: { owner: true, members: true, selected: [false, true] },
			before: [true, false],
			after: [false, true],
		});
	} finally {
		await page.close();
	}
});

it('prepares independent multi-select choices across groups without publishing or replacing hosts', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			document.body.innerHTML =
				'<form><select multiple><option value="a" selected>A</option><optgroup label="Other" disabled><option value="b">B</option><option value="c">C</option></optgroup></select><input value="draft"></form>';
			const form = document.querySelector('form')!;
			const select = form.querySelector('select')!;
			const input = form.querySelector('input')!;
			input.value = 'user draft';
			const [a, b, c] = [...select.options];
			const selected = (node: HTMLSelectElement) =>
				[...node.selectedOptions].map((option) => option.value);
			const stage = new window.OctaneStage.DOMStage();
			stage.view(b!).selected = true;
			stage.view(a!).selected = false;
			stage.view(c!).selected = true;
			const prepared = {
				selection: selected(stage.view(select)),
				flags: [a, b, c].map((option) => stage.view(option!).selected),
				value: stage.view(select).value,
				index: stage.view(select).selectedIndex,
				identity: [...stage.view(select).selectedOptions].every(
					(option, index) => option === [b, c][index],
				),
			};
			const before = selected(select);
			stage.commit();
			const after = selected(select);
			const identity = [...select.options].every((option, index) => option === [a, b, c][index]);
			const draft = input.value;
			form.reset();
			const reset = selected(select);
			const next = new window.OctaneStage.DOMStage();
			const added = next.created(document.createElement('option'));
			added.value = 'd';
			const group = select.querySelector('optgroup')!;
			next.view(group).insertBefore(added, c!);
			next.view(group).removeChild(b!);
			next.view(a!).selected = false;
			next.view(added).selected = true;
			const inserted = {
				selection: selected(next.view(select)),
				options: [...next.view(select).options].every(
					(option, index) => option === [a, added, c][index],
				),
				before: selected(select),
			};
			next.commit();
			return {
				prepared,
				before,
				after,
				identity,
				draft,
				reset,
				inserted,
				final: selected(select),
				retained: select.options[2] === c,
				removed: b!.parentNode === null,
			};
		});
		expect(observed).toEqual({
			prepared: {
				selection: ['b', 'c'],
				flags: [false, true, true],
				value: 'b',
				index: 1,
				identity: true,
			},
			before: ['a'],
			after: ['b', 'c'],
			identity: true,
			draft: 'user draft',
			reset: ['a'],
			inserted: { selection: ['d'], options: true, before: ['a'] },
			final: ['d'],
			retained: true,
			removed: true,
		});
	} finally {
		await page.close();
	}
});

it('keeps native select-wide writes and staged multiple changes consistent with option writes', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			const select = document.createElement('select');
			select.multiple = true;
			select.innerHTML =
				'<option value="a" selected>A</option><option value="b">B</option><option value="c">C</option>';
			const [a, b, c] = [...select.options];
			const selected = (node: HTMLSelectElement) =>
				[...node.selectedOptions].map((option) => option.value);
			const stage = new window.OctaneStage.DOMStage();
			const view = stage.view(select);
			view.multiple = false;
			stage.view(b!).selected = true;
			const single = selected(view);
			view.selectedIndex = 0;
			view.multiple = true;
			stage.view(c!).selected = true;
			const multiple = selected(view);
			view.value = 'b';
			const byValue = selected(view);
			stage.view(a!).selected = true;
			const prepared = selected(view);
			const before = selected(select);
			stage.commit();
			return { single, multiple, byValue, prepared, before, after: selected(select) };
		});
		expect(observed).toEqual({
			single: ['b'],
			multiple: ['a', 'c'],
			byValue: ['b'],
			prepared: ['a', 'b'],
			before: ['a'],
			after: ['a', 'b'],
		});
	} finally {
		await page.close();
	}
});

it('updates a fresh multi-select option after a select-wide staged write', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			const stage = new window.OctaneStage.DOMStage();
			const select = stage.created(document.createElement('select'));
			select.multiple = true;
			select.innerHTML = '<option value="a">A</option><option value="b">B</option>';
			stage.view(select).value = 'a';
			stage.view(select.options[1]!).selected = true;
			const prepared = [...stage.view(select).selectedOptions].map((option) => option.value);
			const flags = [...select.options].map((option) => stage.view(option).selected);
			stage.commit();
			return { prepared, flags, after: [...select.selectedOptions].map((option) => option.value) };
		});
		expect(observed).toEqual({ prepared: ['a', 'b'], flags: [true, true], after: ['a', 'b'] });
	} finally {
		await page.close();
	}
});

it.each(['', 'detached'])('preserves independent radio dirty state when name=%j', async (name) => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate((name) => {
			const form = document.createElement('form');
			form.innerHTML = '<input type="radio" checked><input type="radio" checked>';
			const input = form.firstElementChild as HTMLInputElement;
			input.name = name;
			if (name) form.removeChild(input);
			else document.body.append(form);
			const stage = new window.OctaneStage.DOMStage();
			const prepared = stage.view(input);
			prepared.checked = false;
			prepared.defaultChecked = false;
			prepared.defaultChecked = true;
			const before = [input.checked, input.defaultChecked];
			const state = [prepared.checked, prepared.defaultChecked];
			stage.commit();
			return {
				before,
				state,
				after: [input.checked, input.defaultChecked],
				neighbor: (form.lastElementChild as HTMLInputElement).checked,
			};
		}, name);
		expect(observed).toEqual({
			before: [true, true],
			state: [false, true],
			after: [false, true],
			neighbor: true,
		});
	} finally {
		await page.close();
	}
});

it('uses current staged form ownership when selecting an external radio', async () => {
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(() => {
			document.body.innerHTML =
				'<form id="owner-a"><input id="a" type="radio" name="choice" checked></form><form id="owner-b"><input id="b" type="radio" name="choice" checked><input id="choice" value="collision"></form><input id="external" type="radio" name="choice" form="owner-a">';
			const nodes = ['a', 'b', 'external'].map(
				(id) => document.getElementById(id) as HTMLInputElement,
			);
			const stage = new window.OctaneStage.DOMStage();
			const originalOwner = stage.view(nodes[2]!).form!.id;
			stage.view(nodes[2]!).setAttribute('form', 'owner-b');
			stage.view(nodes[2]!).name = 'renamed';
			stage.view(nodes[1]!).name = 'renamed';
			stage.view(nodes[2]!).checked = true;
			const prepared = nodes.map((node) => stage.view(node).checked);
			const before = nodes.map((node) => node.checked);
			stage.commit();
			return {
				originalOwner,
				prepared,
				before,
				after: nodes.map((node) => node.checked),
				owner: nodes[2]!.form!.id,
				identity: nodes.every((node) => document.getElementById(node.id) === node),
				collision: (document.getElementById('choice') as HTMLInputElement).value,
			};
		});
		expect(observed).toEqual({
			originalOwner: 'owner-a',
			prepared: [true, false, true],
			before: [true, true, false],
			after: [true, false, true],
			owner: 'owner-b',
			identity: true,
			collision: 'collision',
		});
	} finally {
		await page.close();
	}
});

it.each(['text', 'radio'])(
	'restores the owning radio group despite a %s ID collision',
	async (collisionType) => {
		const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
		try {
			const observed = await page.evaluate(async (collisionType) => {
				const {
					createRoot,
					createElement: h,
					flushSync,
					act,
					startTransition,
					requestFormReset,
				} = window.OctaneStage;
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
	const page = await openStagePage(browser, process.env.OCTANE_VT_BROWSER_PACKAGE);
	try {
		const observed = await page.evaluate(async () => {
			const { createRoot, createElement: h, flushSync, act, use } = window.OctaneStage;
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
