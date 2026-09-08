import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { ThinkingOrbRenderProbe } from '../_fixtures/render-probe.tsrx';

describe('@octanejs/thinking-orbs — render contract', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
	});

	it('renders an accessible canvas for a shipped state preset', () => {
		root = mount(ThinkingOrbRenderProbe);
		flushEffects();
		flushSync(() => {});

		const canvas = root.container.querySelector('canvas[role="img"]');
		expect(canvas).not.toBeNull();
		expect(canvas?.getAttribute('aria-label')).toBe('Composing…');
		expect((canvas as HTMLCanvasElement).width).toBeGreaterThan(0);
	});
});
