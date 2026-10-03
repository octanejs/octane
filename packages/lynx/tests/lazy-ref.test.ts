import { describe, expect, it, vi } from 'vitest';
import {
	defineUniversalComponent,
	renderLynxFirstScreen,
	universalPlan,
	universalProps,
	universalValue,
	useRef,
	useLazyRef,
} from '../src/main-renderer.js';

describe('Lynx first-screen lazy ref', () => {
	it('initializes the ref while leaving ordinary function values untouched', () => {
		const factory = vi.fn(() => 'ready');
		const callback = vi.fn();
		const plan = universalPlan('lynx', {
			kind: 'host',
			type: 'text',
			propsSlot: 0,
			children: [{ kind: 'text', slot: 1 }],
		});
		const Scene = defineUniversalComponent('lynx', () => {
			const value = useLazyRef(factory);
			const ordinary = useRef(callback);
			return universalValue(plan, [
				universalProps([]),
				`${value.current}:${ordinary.current === callback}`,
			]);
		});
		const result = renderLynxFirstScreen(Scene, {});
		expect(result.batch.commands).toContainEqual({
			op: 'create',
			id: 2,
			type: '#text',
			props: { value: 'ready:true' },
		});
		expect(factory).toHaveBeenCalledTimes(1);
		expect(callback).not.toHaveBeenCalled();
	});
});
