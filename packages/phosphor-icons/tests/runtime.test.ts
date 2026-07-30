import { createElement } from 'octane';
import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers.js';
import { Camera, IconContext } from '@octanejs/phosphor-icons';
import { __iconWeights as cameraWeights } from '@octanejs/phosphor-icons/icons/camera';

describe('@octanejs/phosphor-icons — runtime behavior', () => {
	it('renders the upstream defaults', () => {
		const mounted = mount(Camera, { id: 'default' });
		const camera = mounted.find('#default');

		expect(camera.getAttribute('width')).toBe('1em');
		expect(camera.getAttribute('height')).toBe('1em');
		expect(camera.getAttribute('fill')).toBe('currentColor');
		expect(camera.getAttribute('transform')).toBe(null);
		expect(camera.querySelectorAll('path')).toHaveLength(cameraWeights.regular.length);
		expect(camera.querySelector('path')?.getAttribute('d')).toBe(cameraWeights.regular[0][1].d);

		mounted.unmount();
	});

	it('applies defaults, local props, accessibility, children, refs, and native events', () => {
		const refs: (SVGSVGElement | null)[] = [];
		const clicks: MouseEvent[] = [];
		const mounted = mount(Camera, {
			id: 'camera',
			alt: 'Take a photo',
			color: 'rebeccapurple',
			size: 32,
			weight: 'duotone',
			mirrored: true,
			ref: (node) => refs.push(node),
			onClick: (event: MouseEvent) => clicks.push(event),
			children: createElement('desc', { children: 'A custom description' }),
		});
		const camera = mounted.find('#camera');

		expect(camera.getAttribute('width')).toBe('32');
		expect(camera.getAttribute('height')).toBe('32');
		expect(camera.getAttribute('fill')).toBe('rebeccapurple');
		expect(camera.getAttribute('transform')).toBe('scale(-1, 1)');
		expect(camera.querySelector('title')?.textContent).toBe('Take a photo');
		expect(camera.querySelector('desc')?.textContent).toBe('A custom description');
		expect(camera.querySelectorAll('path')).toHaveLength(2);
		expect(camera.querySelector('path')?.getAttribute('opacity')).toBe('0.2');
		expect(refs).toEqual([camera]);

		mounted.click('#camera');
		expect(clicks).toHaveLength(1);
		expect(clicks[0]).toBeInstanceOf(MouseEvent);

		mounted.unmount();
		expect(refs.at(-1)).toBe(null);
	});

	it('inherits mirrored context and lets explicit false override it', () => {
		const contextRefs: (SVGSVGElement | null)[] = [];
		const localRefs: (SVGSVGElement | null)[] = [];
		const unsafeContextValue = {
			color: 'tomato',
			size: 40,
			weight: 'bold',
			mirrored: true,
			className: 'provided',
			'data-source': 'context',
			// Simulate an untyped JavaScript consumer passing the unsupported value.
			ref: (node: SVGSVGElement | null) => contextRefs.push(node),
		};
		const App = () =>
			createElement(IconContext.Provider, {
				value: unsafeContextValue as never,
				children: [
					createElement(Camera, { id: 'provided' }),
					createElement(Camera, {
						id: 'local',
						color: 'navy',
						size: 18,
						weight: 'thin',
						mirrored: false,
						className: 'local',
						ref: (node) => localRefs.push(node),
					}),
				],
			});
		const mounted = mount(App);

		const provided = mounted.find('#provided');
		expect(provided.getAttribute('fill')).toBe('tomato');
		expect(provided.getAttribute('width')).toBe('40');
		expect(provided.getAttribute('transform')).toBe('scale(-1, 1)');
		expect(provided.getAttribute('class')).toBe('provided');
		expect(provided.getAttribute('data-source')).toBe('context');
		expect(provided.querySelector('path')?.getAttribute('d')).toBe(cameraWeights.bold[0][1].d);

		const local = mounted.find('#local');
		expect(local.getAttribute('fill')).toBe('navy');
		expect(local.getAttribute('width')).toBe('18');
		expect(local.getAttribute('transform')).toBe(null);
		expect(local.getAttribute('class')).toBe('local');
		expect(local.querySelector('path')?.getAttribute('d')).toBe(cameraWeights.thin[0][1].d);
		expect(contextRefs).toEqual([]);
		expect(localRefs).toEqual([local]);

		mounted.unmount();
		expect(contextRefs).toEqual([]);
		expect(localRefs.at(-1)).toBe(null);
	});
});

// Every icon renders its weight's SVG primitives as an ARRAY child, which is a
// keyed position in octane's reconciler. Upstream sidesteps this by storing one
// ReactElement per weight; this port stores `[tag, attributes]` tuples so the
// generated icons stay tree-shakeable, which means the port owns the keys.
// Without them octane warns, and a weight switch reconciles by position with no
// identity — the exact case the warning exists for.
describe('@octanejs/phosphor-icons — keyed weight primitives', () => {
	function captureWarnings(run: () => void): string[] {
		const seen: string[] = [];
		const original = console.warn;
		console.warn = (...args: unknown[]) => {
			seen.push(args.map(String).join(' '));
		};
		try {
			run();
		} finally {
			console.warn = original;
		}
		return seen;
	}

	it('renders without octane key warnings', () => {
		const warnings = captureWarnings(() => {
			const mounted = mount(Camera, { id: 'keyed' });
			mounted.unmount();
		});
		expect(warnings.filter((w) => w.includes('unique "key"'))).toEqual([]);
	});

	it('swaps every primitive when the weight changes', () => {
		const mounted = mount(Camera, { id: 'w', weight: 'regular' });
		const before = [...mounted.find('#w').querySelectorAll('path')].map((p) => p.getAttribute('d'));
		expect(before).toEqual(cameraWeights.regular.map(([, attrs]) => attrs.d));

		mounted.update(Camera, { id: 'w', weight: 'duotone' } as never);
		const after = [...mounted.find('#w').querySelectorAll('path')].map((p) => p.getAttribute('d'));
		expect(after).toEqual(cameraWeights.duotone.map(([, attrs]) => attrs.d));
		mounted.unmount();
	});
});
