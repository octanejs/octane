import { cleanup as cleanupOctane, render as renderOctane } from '@octanejs/testing-library';
import { cleanup as cleanupReact, render as renderReact } from '@testing-library/react';
import { createElement } from 'react';
import { ThinkingOrb as ReactThinkingOrb } from 'thinking-orbs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThinkingOrb } from '../../src/index';
import { installCanvasMocks } from '../canvas-mock';

afterEach(() => {
	cleanupOctane();
	cleanupReact();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

describe('differential: @octanejs/thinking-orbs vs thinking-orbs@0.3.1', () => {
	// @parity-case differential:thinking-orbs-react
	it('matches canvas attributes and draw operations for a frozen public state', () => {
		const mocks = installCanvasMocks();
		vi.spyOn(performance, 'now').mockReturnValue(4_200);
		const props = {
			state: 'connecting' as const,
			size: 20 as const,
			theme: 'dark' as const,
			speed: 1.5,
			paused: true,
			'aria-label': 'Connecting services',
			'data-orb': 'connection',
			style: { opacity: 0.75 },
		};
		const react = renderReact(createElement(ReactThinkingOrb, props)).container.querySelector(
			'canvas',
		)!;
		const octane = renderOctane(ThinkingOrb, { props }).container.querySelector('canvas')!;

		for (const attribute of ['role', 'aria-label', 'data-orb', 'style']) {
			expect(octane.getAttribute(attribute), attribute).toBe(react.getAttribute(attribute));
		}
		expect(octane.width).toBe(react.width);
		expect(octane.height).toBe(react.height);
		expect(mocks.operationsFor(octane)).toEqual(mocks.operationsFor(react));
	});
});
