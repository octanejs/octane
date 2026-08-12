import {
	AccumulativeShadows,
	RandomizedLight,
	accumulativeContext,
	type AccumulativeShadowsProps,
	type RandomizedLightProps,
} from '@octanejs/drei';

const shadows: AccumulativeShadowsProps = {
	frames: 40,
	temporal: true,
	resolution: 512,
	color: 'black',
};
const light: RandomizedLightProps = { amount: 8, radius: 4, position: [1, 2, 3], mapSize: 1024 };
void shadows;
void light;
void AccumulativeShadows;
void RandomizedLight;
void accumulativeContext;

// @ts-expect-error amount is numeric
const invalid: RandomizedLightProps = { amount: 'many' };
void invalid;
