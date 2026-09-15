import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import { ThinkingOrbRenderProbe } from '../_fixtures/render-probe.tsrx';
import { ThinkingOrbRefProbe } from '../_fixtures/ref-probe.tsrx';

describe('@octanejs/thinking-orbs — render contract', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	// @parity-case thinking-orbs:refs:1
	it('preserves canvas initialization and focus when a consumer supplies a ref', () => {
		vi.stubGlobal('devicePixelRatio', 1);
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const onRef = vi.fn();
		root = mount(ThinkingOrbRefProbe, { onRef });
		flushEffects();
		flushSync(() => {});
		const canvas = root.container.querySelector('canvas')!;
		expect(onRef).toHaveBeenLastCalledWith(canvas);
		expect(canvas.width).toBe(20);
		expect(canvas.height).toBe(20);
		canvas.focus();
		expect(document.activeElement).toBe(canvas);
		root.unmount();
		root = undefined;
		expect(onRef).toHaveBeenLastCalledWith(null);
	});

	// @parity-case thinking-orbs:refs:2
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
