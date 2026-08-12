// Per packages/core/src/AnimationConfig.test.ts:1
import { describe, expect, it } from 'vitest';
import { AnimationConfig, mergeConfig } from '../../src/core/AnimationConfig.ts';

const expo = function expo(t: number) {
	return Math.pow(t, 2);
};

describe('mergeConfig', function mergeConfigSuite() {
	it('can merge partial configs', function canMergePartialConfigs() {
		let config = new AnimationConfig();
		mergeConfig(config, { tension: 0 });
		mergeConfig(config, { friction: 0 });
		expect(config).toMatchObject({
			tension: 0,
			friction: 0,
		});

		config = new AnimationConfig();
		mergeConfig(config, { frequency: 2 });
		mergeConfig(config, { damping: 0 });
		expect(config).toMatchObject({
			frequency: 2,
			damping: 0,
		});

		config = new AnimationConfig();
		mergeConfig(config, { duration: 2000 });
		mergeConfig(config, { easing: expo });
		expect(config).toMatchObject({
			duration: 2000,
			easing: expo,
		});
	});

	it('resets the "duration" when props are incompatible', function resetsDuration() {
		const config = new AnimationConfig();

		mergeConfig(config, { duration: 1000 });
		expect(config.duration).toBeDefined();

		mergeConfig(config, { decay: 0.998 });
		expect(config.duration).toBeUndefined();
		expect(config.decay).toBe(0.998);

		mergeConfig(config, { duration: 1000 });
		expect(config.duration).toBeDefined();

		mergeConfig(config, { frequency: 0.5 });
		expect(config.duration).toBeUndefined();
		expect(config.frequency).toBe(0.5);
	});

	it('resets the "decay" when props are incompatible', function resetsDecay() {
		const config = new AnimationConfig();

		mergeConfig(config, { decay: 0.998 });
		expect(config.decay).toBeDefined();

		mergeConfig(config, { mass: 2 });
		expect(config.decay).toBeUndefined();
		expect(config.mass).toBe(2);
	});

	it('resets the "frequency" when props are incompatible', function resetsFrequency() {
		const config = new AnimationConfig();

		mergeConfig(config, { frequency: 0.5 });
		expect(config.frequency).toBeDefined();

		mergeConfig(config, { tension: 0 });
		expect(config.frequency).toBeUndefined();
		expect(config.tension).toBe(0);
	});

	describe('frequency/damping props', function frequencyDampingSuite() {
		it('properly converts to tension/friction', function convertsToTensionFriction() {
			const config = new AnimationConfig();
			const merged = mergeConfig(config, { frequency: 0.5, damping: 1 });
			expect(merged.tension).toBe(157.91367041742973);
			expect(merged.friction).toBe(25.132741228718345);
		});

		it('works with extreme but valid values', function extremeValidValues() {
			const config = new AnimationConfig();
			const merged = mergeConfig(config, { frequency: 2.6, damping: 0.1 });
			expect(merged.tension).toBe(5.840002604194885);
			expect(merged.friction).toBe(0.483321946706122);
		});

		it('prevents a damping ratio less than 0', function preventsNegativeDamping() {
			const config = new AnimationConfig();
			const validConfig = mergeConfig(config, { frequency: 0.5, damping: 0 });
			const invalidConfig = mergeConfig(config, { frequency: 0.5, damping: -1 });
			expect(invalidConfig).toMatchObject(validConfig);
		});

		it('prevents a frequency response less than 0.01', function preventsTinyFrequency() {
			const config = new AnimationConfig();
			const validConfig = mergeConfig(config, { frequency: 0.01, damping: 1 });
			const invalidConfig = mergeConfig(config, { frequency: 0, damping: 1 });
			expect(invalidConfig).toMatchObject(validConfig);
		});
	});
});
