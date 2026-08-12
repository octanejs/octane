import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMachine as useReactMachine } from '@zag-js/react';
import { describe, expect, it } from 'vitest';
import { MachineFixture, machine } from '../_fixtures/machine.tsrx';
import { mount, nextPaint } from '../_helpers';

async function reactTrace() {
	const container = document.createElement('div');
	const root = createRoot(container);
	let service: any;

	function Probe() {
		service = useReactMachine(machine);
		return null;
	}

	await act(async () => {
		root.render(createElement(Probe));
		await Promise.resolve();
	});

	const trace = [`${service!.state.get()}/${service!.context.get('count')}`];
	for (let index = 0; index < 2; index++) {
		await act(async () => {
			service!.send({ type: 'TOGGLE' });
			await Promise.resolve();
		});
		trace.push(`${service!.state.get()}/${service!.context.get('count')}`);
	}

	await act(async () => root.unmount());
	return trace;
}

async function octaneTrace() {
	const result = mount(MachineFixture);
	await nextPaint();
	const trace = [result.find('#machine-state').textContent];

	for (let index = 0; index < 2; index++) {
		result.click('#machine-toggle');
		await nextPaint();
		trace.push(result.find('#machine-state').textContent);
	}

	result.unmount();
	return trace;
}

describe('upstream differential parity', () => {
	// @parity-case differential:machine-trace
	it('matches @zag-js/react@1.42.0 for transitions and bindable context', async () => {
		expect(await octaneTrace()).toEqual(await reactTrace());
	});
});
