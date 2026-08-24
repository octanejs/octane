import { Fragment, createElement, type ComponentBody } from 'octane';
import { cleanup, render } from '@octanejs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import ContentLoader, { BulletList, Code, Facebook, Instagram, List } from '../src/index';
import uid from '../src/shared/uid';
import Svg from '../src/web/Svg.tsrx';
import type { IContentLoaderProps } from '../src/web/types';

function renderComponent(
	component: ComponentBody<IContentLoaderProps>,
	props: IContentLoaderProps = {},
): SVGSVGElement {
	const { container } = render(component, { props });
	const svg = container.querySelector('svg');
	if (!(svg instanceof SVGSVGElement)) {
		throw new Error('Expected content loader to render an SVG root');
	}
	return svg;
}

function clipRect(svg: SVGSVGElement): SVGRectElement {
	const rect = svg.querySelector('rect[clip-path]');
	if (rect === null) {
		throw new Error('Expected content loader mask rectangle');
	}
	return rect as SVGRectElement;
}

function observedUrl(value: string | null): string {
	if (value == null) {
		throw new Error('Expected a url() value');
	}
	// OCTANE DIVERGENCE: Octane serializes SVG/CSS url() functions with quotes
	// (`url("#id")`) while React's test renderer reports the unquoted form
	// (`url(#id)`). The uniqueKey/baseUrl relationship is unchanged.
	return value.replace(/^url\("([^"]+)"\)$/, 'url($1)');
}

function observableMarkup(markup: string): string {
	// OCTANE DIVERGENCE: Octane inserts empty comment holes between children.
	// Snapshots compare the public SVG tree, not hole-marker spelling.
	return markup.replace(/<!---->/g, '');
}

afterEach(function resetDom() {
	cleanup();
	document.body.replaceChildren();
});

describe('Svg', function svgSuite() {
	// Per packages/content-loader/upstream/src/web/__tests__/Svg.test.tsx
	it('`baseUrl` is used correctly', function baseUrl() {
		const svg = renderComponent(Svg, { baseUrl: '/page-path' });
		const clipPath = svg.querySelector('clipPath')!;
		const gradient = svg.querySelector('linearGradient')!;
		expect(observedUrl(clipRect(svg).getAttribute('clip-path'))).toBe(
			`url(/page-path#${clipPath.id})`,
		);
		expect(observedUrl(clipRect(svg).style.fill)).toBe(`url(/page-path#${gradient.id})`);
	});

	describe('it has basic elements necessary to work ', function elements() {
		it('has a `rect` with `clipPath`', function rect() {
			expect(renderComponent(Svg).querySelectorAll('rect[clip-path]')).toHaveLength(1);
		});

		it('has a `linearGradient`', function gradient() {
			expect(renderComponent(Svg).querySelectorAll('linearGradient')).toHaveLength(1);
		});

		it('has three `stop`', function stops() {
			expect(renderComponent(Svg).querySelectorAll('stop')).toHaveLength(3);
		});

		it('has `stop` inside the `linearGradient`', function nestedStops() {
			expect(renderComponent(Svg).querySelectorAll('linearGradient stop')).toHaveLength(3);
		});
	});

	describe('unique key', function uniqueKey() {
		it('`id` does not generate undefined `id` values for SVG', function ids() {
			const svg = renderComponent(Svg);
			expect(svg.querySelector('clipPath')?.id).toBeTruthy();
			expect(svg.querySelector('linearGradient')?.id).toBeTruthy();
		});

		it('custom `id` is used', function customId() {
			const svg = renderComponent(Svg, { uniqueKey: 'my-unique-key' });
			expect(svg.querySelector('clipPath')?.id).toBe('my-unique-key-diff');
			expect(svg.querySelector('linearGradient')?.id).toBe('my-unique-key-animated-diff');
		});

		it('render two components with different ids', function distinctIds() {
			const first = renderComponent(Svg);
			const second = renderComponent(Svg);
			expect(first.querySelector('clipPath')?.id).not.toBe(second.querySelector('clipPath')?.id);
			expect(first.querySelector('linearGradient')?.id).not.toBe(
				second.querySelector('linearGradient')?.id,
			);
		});

		it('clipPath id and rect clipPath url are the same', function clipId() {
			const svg = renderComponent(Svg);
			expect(observedUrl(clipRect(svg).getAttribute('clip-path'))).toBe(
				`url(#${svg.querySelector('clipPath')?.id})`,
			);
		});

		it('linearGradient id and rect clipPath fill are the same', function gradientId() {
			const svg = renderComponent(Svg);
			expect(observedUrl(clipRect(svg).style.fill)).toBe(
				`url(#${svg.querySelector('linearGradient')?.id})`,
			);
		});
	});

	describe('a11y', function a11y() {
		it('svg has aria-labelledby', function labelledBy() {
			const labelledBy = renderComponent(Svg).getAttribute('aria-labelledby');
			expect(typeof labelledBy).toBe('string');
			expect(labelledBy).not.toBe('');
		});

		it('aria-labelledby point to title', function pointsToTitle() {
			const svg = renderComponent(Svg);
			expect(svg.querySelector('title')?.id).toBe(svg.getAttribute('aria-labelledby'));
		});

		it('svg has role', function role() {
			expect(renderComponent(Svg).getAttribute('role')).toBe('img');
		});

		it('svg has a title', function title() {
			const text = renderComponent(Svg).querySelector('title')?.textContent;
			expect(typeof text).toBe('string');
			expect(text).not.toBe('');
		});
	});

	describe('beforeMask', function beforeMask() {
		it('beforeMask is used', function validElement() {
			const svg = renderComponent(Svg, {
				beforeMask: createElement('rect', { role: 'beforeMask' }),
			});
			expect(svg.querySelector('[role="beforeMask"]')?.getAttribute('role')).toBe('beforeMask');
		});

		it('beforeMask should be a JSX Element', function invalidElement() {
			const svg = renderComponent(Svg, {
				beforeMask: function invalidMask() {
					return createElement('rect', { role: 'beforeMask' });
				},
			});
			expect(svg.querySelector('[role="beforeMask"]')).toBeNull();
		});
	});
});

describe('ContentLoader', function contentLoaderSuite() {
	// Per packages/content-loader/upstream/src/web/__tests__/ContentLoader.test.tsx
	describe('when type is custom', function custom() {
		it('should render custom element', function customElements() {
			const svg = renderComponent(ContentLoader, {
				children: [
					createElement('rect', {
						x: 80,
						y: 17,
						rx: 4,
						ry: 4,
						width: 300,
						height: 13,
					}),
					createElement('rect', {
						x: 82,
						y: 44,
						rx: 3,
						ry: 3,
						width: 250,
						height: 10,
					}),
					createElement('circle', { cx: 35, cy: 35, r: 35 }),
				],
			});
			// OCTANE DIVERGENCE: react-test-renderer queries are observed through
			// the mounted SVG DOM, retaining the upstream numeric expectations.
			expect(svg.querySelectorAll('rect')).toHaveLength(3);
			expect(svg.querySelectorAll('circle')).toHaveLength(1);
		});
	});

	describe('Props are propagated', function propagated() {
		function fullSvg(): SVGSVGElement {
			return renderComponent(ContentLoader, {
				animate: false,
				backgroundColor: '#000',
				backgroundOpacity: 0.06,
				baseUrl: '/mypage',
				foregroundColor: '#fff',
				foregroundOpacity: 0.12,
				gradientRatio: 0.5,
				height: 200,
				preserveAspectRatio: 'xMaxYMax meet',
				rtl: true,
				speed: 10,
				style: { marginBottom: '10px' },
				title: 'My custom loading title',
				uniqueKey: 'my-id',
				width: 200,
				beforeMask: createElement('rect', { 'data-before-mask': '' }),
				children: createElement('rect'),
			});
		}

		it("`speed` is a number and it's used", function speed() {
			// OCTANE DIVERGENCE: upstream shallow-renders the Svg prop object.
			// Octane observes the published animateTransform duration. The
			// fullSvg fixture sets animate={false}, which omits that node, so
			// speed is asserted on an otherwise matching tree with animation on.
			const svg = renderComponent(ContentLoader, {
				animate: true,
				speed: 10,
				uniqueKey: 'my-id',
				children: createElement('rect'),
			});
			expect(svg.querySelector('animateTransform')?.getAttribute('dur')).toBe('10s');
		});
		it("`height` is a number and it's used", function height() {
			expect(fullSvg().getAttribute('height')).toBe('200');
		});
		it("`width` is a number and it's used", function width() {
			expect(fullSvg().getAttribute('width')).toBe('200');
		});
		it("`gradientRatio` is a number and it's used", function gradientRatio() {
			expect(fullSvg().querySelector('linearGradient')?.getAttribute('gradientTransform')).toBe(
				'translate(-0.5 0)',
			);
		});
		it("`animate` is a boolean and it's used", function animate() {
			expect(fullSvg().querySelector('animateTransform')).toBeNull();
		});
		it("`backgroundColor` is a string and it's used", function background() {
			expect(fullSvg().querySelector('stop')?.getAttribute('stop-color')).toBe('#000');
		});
		it("`foregroundColor` is a string and it's used", function foreground() {
			expect(fullSvg().querySelectorAll('stop')[1]?.getAttribute('stop-color')).toBe('#fff');
		});
		it("`backgroundOpacity` is a number and it's used", function backgroundOpacity() {
			expect(fullSvg().querySelector('stop')?.getAttribute('stop-opacity')).toBe('0.06');
		});
		it("`foregroundOpacity` is a number and it's used", function foregroundOpacity() {
			expect(fullSvg().querySelectorAll('stop')[1]?.getAttribute('stop-opacity')).toBe('0.12');
		});
		it("`preserveAspectRatio` is a string and it's used", function aspectRatio() {
			expect(fullSvg().getAttribute('preserveAspectRatio')).toBe('xMaxYMax meet');
		});
		it("`style` is an object and it's used", function style() {
			expect(fullSvg().style.marginBottom).toBe('10px');
		});
		it("`rtl` is a boolean and it's used", function rtl() {
			expect(fullSvg().style.transform).toBe('scaleX(-1)');
		});
		it("`title` is a string and it's used", function title() {
			expect(fullSvg().querySelector('title')?.textContent).toBe('My custom loading title');
		});
		it("`baseUrl` is a string and it's used", function baseUrl() {
			expect(observedUrl(clipRect(fullSvg()).getAttribute('clip-path'))).toBe(
				'url(/mypage#my-id-diff)',
			);
		});
		it("`uniqueKey` is a string and it's used", function uniqueKey() {
			expect(fullSvg().querySelector('clipPath')?.id).toBe('my-id-diff');
		});
		it("`beforeMask` is a JSX Element and it's used", function mask() {
			expect(fullSvg().querySelector('[data-before-mask]')).not.toBeNull();
		});
	});
});

describe('index', function indexSuite() {
	// Per packages/content-loader/upstream/src/web/__tests__/index.test.tsx
	it('renders', function renders() {
		expect(renderComponent(ContentLoader)).toBeInstanceOf(SVGSVGElement);
	});

	it('renders a SVG as root element ', function rootSvg() {
		const svg = renderComponent(ContentLoader);
		expect(svg.parentElement?.querySelectorAll('svg')).toHaveLength(1);
	});
});

describe('unique id', function uidSuite() {
	const count = 100;
	const ids = new Array(count).fill(' ').map(function makeId() {
		return uid();
	});

	it(`should have ${count} diferents ids`, function unique() {
		expect(Array.from(new Set(ids))).toHaveLength(count);
	});

	it('return a string', function stringId() {
		expect(typeof uid()).toBe('string');
	});
});

describe('ContentLoader snapshots', function snapshots() {
	// Per packages/content-loader/upstream/src/web/__tests__/snapshots.test.tsx
	it('renders correctly the basic version', function basic() {
		expect(
			observableMarkup(renderComponent(ContentLoader, { uniqueKey: 'snapshots' }).outerHTML),
		).toMatchSnapshot('basic version');
	});

	it('renders correctly with viewBox empty', function emptyViewBox() {
		expect(
			observableMarkup(
				renderComponent(ContentLoader, {
					uniqueKey: 'snapshots',
					viewBox: '',
				}).outerHTML,
			),
		).toMatchSnapshot('empty viewBox');
	});

	it('renders correctly with viewBox defined', function viewBox() {
		expect(
			observableMarkup(
				renderComponent(ContentLoader, {
					uniqueKey: 'snapshots',
					viewBox: '0 0 100 100',
				}).outerHTML,
			),
		).toMatchSnapshot('defined viewBox');
	});

	it('renders correctly with viewBox defined and sizes defined too', function sizes() {
		expect(
			observableMarkup(
				renderComponent(ContentLoader, {
					uniqueKey: 'snapshots',
					width: 100,
					height: 100,
					viewBox: '0 0 100 100',
				}).outerHTML,
			),
		).toMatchSnapshot('defined viewBox and sizes');
	});

	it('renders correctly with beforeMask', function mask() {
		const valid = renderComponent(ContentLoader, {
			uniqueKey: 'snapshots',
			beforeMask: createElement(
				Fragment,
				null,
				createElement('rect', { role: 'outline1' }),
				createElement('rect', { role: 'outline2' }),
			),
			children: createElement('rect'),
		});
		expect(observableMarkup(valid.outerHTML)).toMatchSnapshot('valid beforeMask');

		const invalid = renderComponent(ContentLoader, {
			uniqueKey: 'snapshots',
			beforeMask: function invalidMask() {
				return createElement('rect');
			},
			children: createElement('rect'),
		});
		expect(observableMarkup(invalid.outerHTML)).toMatchSnapshot('invalid beforeMask');
	});
});

const presets = [
	['FacebookStyle', Facebook, '0 0 476 124', 6, 1],
	['InstagramStyle', Instagram, '0 0 400 460', 4, 1],
	['CodeStyle', Code, '0 0 340 84', 9, 0],
	['ListStyle', List, '0 0 400 110', 7, 0],
	['BulletListStyle', BulletList, '0 0 245 125', 5, 4],
] as const;

for (const [name, preset, viewBox, rects, circles] of presets) {
	describe(name, function presetSuite() {
		it('renders correctly', function renders() {
			const svg = renderComponent(preset, { uniqueKey: name, speed: 20 });
			// OCTANE DIVERGENCE: upstream renderer snapshots are asserted through
			// the complete observable SVG DOM plus their exact shape counts.
			expect(observableMarkup(svg.outerHTML)).toMatchSnapshot(name);
			expect(svg.getAttribute('viewBox')).toBe(viewBox);
			expect(svg.querySelectorAll('rect')).toHaveLength(rects);
			expect(svg.querySelectorAll('circle')).toHaveLength(circles);
		});

		it('props are propagated ', function props() {
			const svg = renderComponent(preset, { uniqueKey: name, speed: 20 });
			expect(svg.querySelector('clipPath')?.id).toBe(`${name}-diff`);
			expect(svg.querySelector('animateTransform')?.getAttribute('dur')).toBe('20s');
		});
	});
}
