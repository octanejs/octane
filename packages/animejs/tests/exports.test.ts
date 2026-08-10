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
