import { describe, expect, it, vi } from 'vitest';
import { materializeOpenTUIProps, type CallbackEnvironment } from '../src/props.js';

describe('@octanejs/opentui host callback materialization', () => {
	// @parity-case adapted:opentui-callback-contract
	it('reuses wrappers without changing receiver, argument, or scheduler semantics', () => {
		const scopes: string[] = [];
		const environment: CallbackEnvironment = {
			eventScope(priority, run) {
				scopes.push(priority);
				return run();
			},
		};
		const handler = vi.fn(function (this: { id: string }, ...args: unknown[]) {
			return [this.id, ...args];
		});

		const first = materializeOpenTUIProps(environment, { onSelect: handler });
		const second = materializeOpenTUIProps(environment, { onSelect: handler });
		expect(second.onSelect).toBe(first.onSelect);

		const result = (first.onSelect as (...args: unknown[]) => unknown).call(
			{ id: 'select' },
			1,
			'two',
		);
		expect(result).toEqual(['select', 1, 'two']);
		expect(handler).toHaveBeenCalledWith(1, 'two');
		expect(scopes).toEqual(['discrete']);
	});

	// @parity-case adapted:opentui-continuous-events
	it('classifies pointer motion as continuous work', () => {
		const priorities: string[] = [];
		const environment: CallbackEnvironment = {
			eventScope(priority, run) {
				priorities.push(priority);
				return run();
			},
		};
		const props = materializeOpenTUIProps(environment, { onMouseMove: vi.fn() });
		(props.onMouseMove as () => void)();
		expect(priorities).toEqual(['continuous']);
	});
});
