import upstreamPackage from 'animejs/package.json';
import bindingPackage from '@octanejs/animejs/package.json';
import * as upstream0 from 'animejs/timer';
import * as binding0 from '@octanejs/animejs/timer';
import * as upstream1 from 'animejs/animation';
import * as binding1 from '@octanejs/animejs/animation';
import * as upstream2 from 'animejs/timeline';
import * as binding2 from '@octanejs/animejs/timeline';
import * as upstream3 from 'animejs/animatable';
import * as binding3 from '@octanejs/animejs/animatable';
import * as upstream4 from 'animejs/draggable';
import * as binding4 from '@octanejs/animejs/draggable';
import * as upstream5 from 'animejs/scope';
import * as binding5 from '@octanejs/animejs/scope';
import * as upstream6 from 'animejs/engine';
import * as binding6 from '@octanejs/animejs/engine';
import * as upstream7 from 'animejs/events';
import * as binding7 from '@octanejs/animejs/events';
import * as upstream8 from 'animejs/layout';
import * as binding8 from '@octanejs/animejs/layout';
import * as upstream9 from 'animejs/easings';
import * as binding9 from '@octanejs/animejs/easings';
import * as upstream10 from 'animejs/easings/eases';
import * as binding10 from '@octanejs/animejs/easings/eases';
import * as upstream11 from 'animejs/easings/linear';
import * as binding11 from '@octanejs/animejs/easings/linear';
import * as upstream12 from 'animejs/easings/steps';
import * as binding12 from '@octanejs/animejs/easings/steps';
import * as upstream13 from 'animejs/easings/irregular';
import * as binding13 from '@octanejs/animejs/easings/irregular';
import * as upstream14 from 'animejs/easings/cubic-bezier';
import * as binding14 from '@octanejs/animejs/easings/cubic-bezier';
import * as upstream15 from 'animejs/easings/spring';
import * as binding15 from '@octanejs/animejs/easings/spring';
import * as upstream16 from 'animejs/utils';
import * as binding16 from '@octanejs/animejs/utils';
import * as upstream17 from 'animejs/svg';
import * as binding17 from '@octanejs/animejs/svg';
import * as upstream18 from 'animejs/text';
import * as binding18 from '@octanejs/animejs/text';
import * as upstream19 from 'animejs/waapi';
import * as binding19 from '@octanejs/animejs/waapi';
import * as upstream20 from 'animejs/adapters';
import * as binding20 from '@octanejs/animejs/adapters';
import { describe, expect, it } from 'vitest';
import * as upstream from 'animejs';
import * as binding from '@octanejs/animejs';
import * as upstreamThree from 'animejs/adapters/three';
import * as bindingThree from '@octanejs/animejs/adapters/three';

describe('@octanejs/animejs exports', () => {
	it('preserves every Anime.js root runtime export and adds only the Octane hook', () => {
		const upstreamExports = Object.keys(upstream).sort();
		const bindingExports = Object.keys(binding).sort();

		expect(bindingExports.filter((name) => name !== 'useAnimeScope')).toEqual(upstreamExports);
		expect(binding.useAnimeScope).toBeTypeOf('function');
	});

	it('preserves every official Three adapter runtime export', () => {
		expect(Object.keys(bindingThree).sort()).toEqual(Object.keys(upstreamThree).sort());
	});
});

const subpaths = [
	['timer', upstream0, binding0],
	['animation', upstream1, binding1],
	['timeline', upstream2, binding2],
	['animatable', upstream3, binding3],
	['draggable', upstream4, binding4],
	['scope', upstream5, binding5],
	['engine', upstream6, binding6],
	['events', upstream7, binding7],
	['layout', upstream8, binding8],
	['easings', upstream9, binding9],
	['easings/eases', upstream10, binding10],
	['easings/linear', upstream11, binding11],
	['easings/steps', upstream12, binding12],
	['easings/irregular', upstream13, binding13],
	['easings/cubic-bezier', upstream14, binding14],
	['easings/spring', upstream15, binding15],
	['utils', upstream16, binding16],
	['svg', upstream17, binding17],
	['text', upstream18, binding18],
	['waapi', upstream19, binding19],
	['adapters', upstream20, binding20],
] as const;

it.each(subpaths)(
	'preserves the %s upstream namespace and runtime identities',
	(_, expected, actual) => {
		expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
		for (const [name, value] of Object.entries(expected)) {
			expect(Reflect.get(actual, name)).toBe(value);
		}
	},
);

it('publishes every upstream entry path with binding package metadata', () => {
	expect(Object.keys(bindingPackage.exports).sort()).toEqual(
		Object.keys(upstreamPackage.exports).sort(),
	);
	expect(bindingPackage.name).toBe('@octanejs/animejs');
});
