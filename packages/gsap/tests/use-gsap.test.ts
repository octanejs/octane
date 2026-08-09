import { describe, expect, it } from 'vitest';
import { createLog, flushEffects, mount } from '../../octane/tests/_helpers';
import { useGSAP } from '@octanejs/gsap';
import type { UseGSAPReturn } from '@octanejs/gsap';
import {
	GSAPNullDependenciesProbe,
	GSAPProbe,
	GSAPUndefinedDependenciesProbe,
} from './_fixtures/app.tsrx';

describe('useGSAP', () => {
	it('runs in a scoped GSAP context and reverts before dependency updates', () => {
		const log = createLog();
		let api: UseGSAPReturn | undefined;
		const capture = (value: UseGSAPReturn) => {
			api = value;
		};
		const root = mount(GSAPProbe, {
			value: 'one',
			log: log.push,
			capture,
			revertOnUpdate: true,
		});

		flushEffects();
		expect(log.drain()).toEqual(['effect:one:1', 'safe:one']);
		const firstContext = api?.context;
		const firstContextSafe = api?.contextSafe;

		root.update(GSAPProbe, {
			value: 'two',
			log: log.push,
			capture,
			revertOnUpdate: true,
		});
		flushEffects();
		expect(log.drain()).toEqual(['cleanup:one', 'effect:two:1', 'safe:two']);
		expect(api?.context).toBe(firstContext);
		expect(api?.contextSafe).toBe(firstContextSafe);

		root.unmount();
		expect(log.drain()).toEqual(['cleanup:two']);
	});

	it('defers context cleanup until unmount when revertOnUpdate is disabled', () => {
		const log = createLog();
		const capture = (_value: UseGSAPReturn) => {};
		const root = mount(GSAPProbe, { value: 'one', log: log.push, capture });

		flushEffects();
		expect(log.drain()).toEqual(['effect:one:1', 'safe:one']);

		root.update(GSAPProbe, { value: 'two', log: log.push, capture });
		flushEffects();
		expect(log.drain()).toEqual(['effect:two:1', 'safe:two']);

		root.unmount();
		expect(log.drain()).toEqual(['cleanup:one', 'cleanup:two']);
	});

	it('reruns when a config explicitly provides undefined dependencies', () => {
		const log = createLog();
		const root = mount(GSAPUndefinedDependenciesProbe, { value: 'one', log: log.push });

		flushEffects();
		expect(log.drain()).toEqual(['effect:one']);

		root.update(GSAPUndefinedDependenciesProbe, { value: 'two', log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['cleanup:one', 'effect:two']);

		root.unmount();
		expect(log.drain()).toEqual(['cleanup:two']);
	});

	it('preserves positional null dependencies so the effect reruns', () => {
		const log = createLog();
		const root = mount(GSAPNullDependenciesProbe, { value: 'one', log: log.push });

		flushEffects();
		expect(log.drain()).toEqual(['effect:one']);

		root.update(GSAPNullDependenciesProbe, { value: 'two', log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['cleanup:one', 'effect:two']);

		root.unmount();
		expect(log.drain()).toEqual(['cleanup:two']);
	});

	it('exposes the upstream static registration contract', () => {
		expect(useGSAP.headless).toBe(true);
		expect(typeof useGSAP.register).toBe('function');
	});
});
