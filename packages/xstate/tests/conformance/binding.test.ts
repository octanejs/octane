import { beforeEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import * as binding from '@octanejs/xstate';
import { mount, nextPaint } from '../_helpers';
import {
	ActorApp,
	ActivityActorApp,
	ContextApp,
	ExternalActorApp,
	MissingContextApp,
	RefApp,
	ReplacementApp,
	SelectedExternalActorApp,
	SlotlessActorApp,
	TwoActorsApp,
	counterMachine,
	lifecycle,
	replacementMachine,
	renders,
} from '../_fixtures/binding.tsrx';

async function flush() {
	for (let i = 0; i < 3; i++) await nextPaint();
}

beforeEach(() => {
	lifecycle.starts = 0;
	lifecycle.stops = 0;
	renders.selected = 0;
});

describe('actors', () => {
	it('starts an actor, renders snapshots, and exposes send', async () => {
		const result = mount(ActorApp);
		await flush();
		expect(result.find('#actor-count').textContent).toBe('0');

		result.click('#increment');
		await flush();
		expect(result.find('#actor-count').textContent).toBe('1');
		expect(result.find('#selected-count').textContent).toBe('1');
		result.unmount();
	});

	it('restarts retained actors after Activity hides and reveals them', async () => {
		const result = mount(ActivityActorApp, { mode: 'visible' });
		await flush();
		result.click('#increment');
		await flush();
		expect(result.find('#actor-count').textContent).toBe('1');

		result.update(ActivityActorApp, { mode: 'hidden' });
		await flush();
		result.update(ActivityActorApp, { mode: 'visible' });
		await flush();
		result.click('#increment');
		await flush();
		expect(result.find('#actor-count').textContent).toBe('2');
		result.unmount();
	});

	it('keeps actor refs stable and stops them on unmount', async () => {
		const captured: any[] = [];
		const result = mount(RefApp, { capture: (actor: any) => captured.push(actor) });
		await flush();
		expect(lifecycle.starts).toBe(1);
		expect(new Set(captured).size).toBe(1);

		result.click('#ref-count');
		await flush();
		expect(result.find('#ref-count').textContent).toBe('1');
		result.unmount();
		await flush();
		captured[0].send({ type: 'increment' });
		expect(captured[0].getSnapshot().context.count).toBe(1);
	});

	it('replaces actors when logic changes and migrates stable observers', async () => {
		const captured: any[] = [];
		const observed: any[] = [];
		const capture = (actor: any) => captured.push(actor);
		const observe = (snapshot: any) => observed.push(snapshot);
		const result = mount(ReplacementApp, { logic: counterMachine, capture, observe });
		await flush();
		result.click('#replacement-count');
		await flush();

		const first = captured.at(-1);
		expect(first.getSnapshot().context.count).toBe(1);
		result.update(ReplacementApp, { logic: replacementMachine, capture, observe });
		await flush();

		const replacement = captured.at(-1);
		expect(replacement).not.toBe(first);
		expect(result.find('#replacement-count').textContent).toBe('1');
		expect(replacement.getSnapshot().status).toBe('active');
		result.click('#replacement-count');
		await flush();
		expect(replacement.getSnapshot().context.count).toBe(2);
		expect(observed.at(-1)?.context.count).toBe(2);
		first.send({ type: 'increment' });
		expect(first.getSnapshot().context.count).toBe(1);
		result.unmount();
	});

	it('keeps multiple actor hook call sites independent', async () => {
		const result = mount(TwoActorsApp);
		await flush();
		result.click('#left');
		await flush();
		expect(result.find('#left').textContent).toBe('1');
		expect(result.find('#right').textContent).toBe('0');

		result.click('#right');
		result.click('#right');
		await flush();
		expect(result.find('#left').textContent).toBe('1');
		expect(result.find('#right').textContent).toBe('2');
		result.unmount();
	});

	it('runs through opaque wrappers that do not forward compiler slots', async () => {
		const result = mount(SlotlessActorApp);
		await flush();
		expect(result.find('#slotless-actor').textContent).toBe('0');

		result.click('#slotless-actor');
		await flush();
		expect(result.find('#slotless-actor').textContent).toBe('1');
		result.unmount();
	});
});

describe('selectors', () => {
	it('subscribes to external actors and tracks their snapshots', async () => {
		const actor = createActor(counterMachine).start();
		const result = mount(ExternalActorApp, { actor });
		expect(result.find('#external-count').textContent).toBe('0');

		actor.send({ type: 'set', count: 4 });
		await flush();
		expect(result.find('#external-count').textContent).toBe('4');
		result.unmount();
		actor.stop();
	});

	it('uses a comparator to retain equal selections', async () => {
		const actor = createActor(counterMachine).start();
		const result = mount(SelectedExternalActorApp, { actor });
		await flush();
		const before = renders.selected;

		actor.send({ type: 'ignore' });
		await flush();
		expect(result.find('#selected-external-count').textContent).toBe('0');
		expect(renders.selected).toBe(before);
		result.unmount();
		actor.stop();
	});
});

describe('actor context', () => {
	it('provides an actor to selector and ref hooks', async () => {
		const result = mount(ContextApp);
		await flush();
		expect(result.find('#context-count').textContent).toBe('0');
		result.click('#context-count');
		await flush();
		expect(result.find('#context-count').textContent).toBe('1');
		result.unmount();
	});

	it('throws a clear error outside its provider', () => {
		expect(() => mount(MissingContextApp)).toThrow(/ActorProvider/);
	});
});

describe('export surface', () => {
	it('provides every runtime export of @xstate/react', async () => {
		const real = await import('@xstate/react');
		expect(Object.keys(binding).sort()).toEqual(Object.keys(real).sort());
	});
});
