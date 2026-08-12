// Per packages/core/src/helpers.test.ts:1
import { describe, expect, it } from 'vitest';
import { inferTo } from '@octanejs/spring';

describe('helpers', function helpersSuite() {
	it('interpolateTo', function interpolateTo() {
		const forwardProps = {
			result: 'ok',
		};
		const restProps = {
			from: 'from',
			config: 'config',
			onStart: 'onStart',
		};
		const excludeProps = {
			children: undefined,
			config: undefined,
			from: undefined,
			to: undefined,
			ref: undefined,
			loop: undefined,
			reset: undefined,
			pause: undefined,
			cancel: undefined,
			reverse: undefined,
			immediate: undefined,
			default: undefined,
			delay: undefined,
			items: undefined,
			trail: undefined,
			sort: undefined,
			expires: undefined,
			initial: undefined,
			enter: undefined,
			leave: undefined,
			update: undefined,
			onProps: undefined,
			onStart: undefined,
			onChange: undefined,
			onPause: undefined,
			onResume: undefined,
			onRest: undefined,
			onResolve: undefined,
			onDestroyed: undefined,
			keys: undefined,
			callId: undefined,
			parentId: undefined,
		};
		const received = inferTo({
			...forwardProps,
			...restProps,
			...excludeProps,
		});
		// Upstream asserts with toMatchObject against an object that includes
		// `to: undefined` from ReservedProps. Browser Vitest ignores undefined
		// expected keys; Node Vitest does not. Assert the reserved props and the
		// forwarded `to` payload separately so both runners pin the same contract.
		const { to: _ignoredTo, ...expectedReserved } = {
			...restProps,
			...excludeProps,
		};
		expect(received).toMatchObject(expectedReserved);
		expect(received.to).toEqual({ result: 'ok' });
	});
});
