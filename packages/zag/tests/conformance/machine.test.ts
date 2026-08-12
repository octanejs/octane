import { describe, expect, it } from 'vitest';
import {
	IndependentMachines,
	LifecycleMachine,
	MachineFixture,
	PortalFixture,
	lifecycleEvents,
} from '../_fixtures/machine.tsrx';
import { mount, nextPaint } from '../_helpers';

describe('useMachine', () => {
	it('drives state transitions and bindable context updates', async () => {
		const result = mount(MachineFixture);
		await nextPaint();

		expect(result.find('#machine-state').textContent).toBe('idle/0');
		result.click('#machine-toggle');
		await nextPaint();
		expect(result.find('#machine-state').textContent).toBe('active/1');

		result.click('#machine-toggle');
		await nextPaint();
		expect(result.find('#machine-state').textContent).toBe('idle/1');
		result.unmount();
	});

	it('keeps bindable reads current across chained actions', async () => {
		const result = mount(MachineFixture);
		await nextPaint();

		result.click('#machine-double');
		await nextPaint();
		expect(result.find('#machine-state').textContent).toBe('active/2');
		result.unmount();
	});

	it('keeps multiple call sites independent', async () => {
		const result = mount(IndependentMachines);
		await nextPaint();

		result.click('#first-toggle');
		await nextPaint();
		expect(result.find('#first-machine').textContent).toBe('active/1');
		expect(result.find('#second-machine').textContent).toBe('idle/0');

		result.click('#second-toggle');
		await nextPaint();
		expect(result.find('#first-machine').textContent).toBe('active/1');
		expect(result.find('#second-machine').textContent).toBe('active/1');
		result.unmount();
	});

	it('runs entry, transition, effect, and cleanup lifecycles in upstream order', async () => {
		lifecycleEvents.length = 0;
		const result = mount(LifecycleMachine);
		await nextPaint();
		expect(lifecycleEvents).toEqual(['idle-effect', 'root-entry', 'root-effect', 'idle-entry']);

		result.click('#lifecycle-next');
		await nextPaint();
		expect(lifecycleEvents).toEqual([
			'idle-effect',
			'root-entry',
			'root-effect',
			'idle-entry',
			'idle-cleanup',
			'idle-exit',
			'transition-action',
			'active-effect',
			'active-entry',
		]);

		result.unmount();
		await Promise.resolve();
		expect(lifecycleEvents.slice(-3)).toEqual(['root-cleanup', 'active-cleanup', 'root-exit']);
	});

	it('does not initialize a machine after an immediate unmount', async () => {
		lifecycleEvents.length = 0;
		const result = mount(LifecycleMachine);
		result.unmount();
		await Promise.resolve();

		expect(lifecycleEvents).not.toContain('root-entry');
		expect(lifecycleEvents).not.toContain('root-effect');
		expect(lifecycleEvents).not.toContain('idle-entry');
		expect(lifecycleEvents).not.toContain('root-exit');
	});
});

describe('Portal', () => {
	it('portals every child into the configured container after mounting', async () => {
		const target = document.createElement('div');
		document.body.append(target);
		const result = mount(PortalFixture, { target });

		await nextPaint();
		expect(target.querySelector('#portalled-first')?.textContent).toBe('first');
		expect(target.querySelector('#portalled-second')?.textContent).toBe('second');
		expect(result.container.querySelector('#portalled-first')).toBeNull();

		result.unmount();
		target.remove();
	});

	it('renders children in place when disabled', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const result = mount(PortalFixture, { target, disabled: true });

		expect(result.find('#portalled-first').textContent).toBe('first');
		expect(result.find('#portalled-second').textContent).toBe('second');
		expect(target.childElementCount).toBe(0);

		result.unmount();
		target.remove();
	});

	it('portals into a Document root instead of the ambient document', async () => {
		const alternateDocument = document.implementation.createHTMLDocument('portal target');
		const result = mount(PortalFixture, {
			target: null,
			getRootNode: () => alternateDocument,
		});

		await nextPaint();
		expect(alternateDocument.body.querySelector('#portalled-first')?.textContent).toBe('first');
		expect(document.body.querySelector('#portalled-first')).toBeNull();

		result.unmount();
	});
});
