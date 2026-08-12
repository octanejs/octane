// Behavioral port of react-spring v10.1.2 packages/core/src/AnimationConfig.ts.
export class AnimationConfig {
	tension = 170;
	friction = 26;
	frequency?: number;
	damping = 1;
	mass = 1;
	velocity: number | number[] = 0;
	restVelocity?: number;
	precision?: number;
	progress?: number;
	duration?: number;
	easing = (value: number): number => value;
	clamp = false;
	bounce?: number;
	decay?: boolean | number;
	round?: number;
}

export function mergeConfig(
	config: AnimationConfig,
	newConfig: Partial<AnimationConfig>,
	defaultConfig?: Partial<AnimationConfig>,
): AnimationConfig {
	let props = newConfig;
	if (defaultConfig) {
		const defaults = { ...defaultConfig };
		sanitizeConfig(defaults, newConfig);
		props = { ...defaults, ...newConfig };
	}
	sanitizeConfig(config, props);
	Object.assign(config, props);
	if (config.frequency !== undefined) {
		config.frequency = Math.max(0.01, config.frequency);
		config.damping = Math.max(0, config.damping);
		config.tension = Math.pow((2 * Math.PI) / config.frequency, 2) * config.mass;
		config.friction = (4 * Math.PI * config.damping * config.mass) / config.frequency;
	}
	return config;
}

function sanitizeConfig(config: Partial<AnimationConfig>, props: Partial<AnimationConfig>): void {
	if (props.decay !== undefined) {
		config.duration = undefined;
	} else {
		const isTensionConfig = props.tension !== undefined || props.friction !== undefined;
		if (
			isTensionConfig ||
			props.frequency !== undefined ||
			props.damping !== undefined ||
			props.mass !== undefined
		) {
			config.duration = undefined;
			config.decay = undefined;
		}
		if (isTensionConfig) {
			config.frequency = undefined;
		}
	}
}
