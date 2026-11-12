import { describe, expect, it } from 'vitest';
import { parsePathSvg, parseStaticSvg } from '../dist/path-svg.js';

describe('static SVG assets', () => {
	it('reads root attributes and ordered paths without interpreting their data', () => {
		const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="24" viewBox="-1, 0, 24, 24" fill="none">
			<path d="M0 0L1.5 2z" fill="currentColor" transform="translate(2 1) scale(1.5)"/>
			<path d='m3-2a2 2 0 0 1 1 1' stroke='#abcdef80' stroke-width='0.5' fill-rule='evenodd' clip-rule='nonzero' />
		</svg>`;
		expect(parseStaticSvg(source)).toEqual({
			root: {
				xmlns: 'http://www.w3.org/2000/svg',
				width: '1em',
				height: '24',
				viewBox: '-1, 0, 24, 24',
				fill: 'none',
			},
			children: [
				{
					tag: 'path',
					attributes: {
						d: 'M0 0L1.5 2z',
						fill: 'currentColor',
						transform: 'translate(2 1) scale(1.5)',
					},
					children: [],
				},
				{
					tag: 'path',
					attributes: {
						d: 'm3-2a2 2 0 0 1 1 1',
						stroke: '#abcdef80',
						'stroke-width': '0.5',
						'fill-rule': 'evenodd',
						'clip-rule': 'nonzero',
					},
					children: [],
				},
			],
		});
	});

	const path = '<path d="M0 0Z"/>';
	it('preserves static groups, rectangles, paint and accessibility attributes in document order', () => {
		const source = `<!-- Drawing metadata before the root --><svg focusable="false" role="img">
			<!-- Original drawing <rect/> -->
			<rect x="-1.5" y="0" width="12" height="2em" rx="2" ry="1" fill="var(--surface-color)"/>
			<g transform="translate(0 -5.5) scale(4.4)"><g>${path}</g></g>
			<path d="M1 1Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="bevel" opacity="0.3"/>
		</svg><!-- End of drawing -->`;
		const leaf = (tag, attributes) => ({ tag, attributes, children: [] });
		expect(parseStaticSvg(source)).toEqual({
			root: { focusable: 'false', role: 'img' },
			children: [
				leaf('rect', {
					x: '-1.5',
					y: '0',
					width: '12',
					height: '2em',
					rx: '2',
					ry: '1',
					fill: 'var(--surface-color)',
				}),
				{
					tag: 'g',
					attributes: { transform: 'translate(0 -5.5) scale(4.4)' },
					children: [{ tag: 'g', attributes: {}, children: [leaf('path', { d: 'M0 0Z' })] }],
				},
				leaf('path', {
					d: 'M1 1Z',
					stroke: 'currentColor',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'bevel',
					opacity: '0.3',
				}),
			],
		});
	});
	const tile = '<pattern id="tile" width="2" height="3" patternUnits="userSpaceOnUse">';
	const tilePath = '<path d="M0 0L2 3" stroke="currentColor" stroke-opacity="0.5"/>';
	const painted = '<rect width="10" height="12" fill="url(#tile)"/>';
	const definition = `<defs>${tile}${tilePath}</pattern></defs>`;

	it('preserves a locally referenced single-path pattern in document order', () => {
		const source = `<svg preserveAspectRatio="none">${painted}${definition}</svg>`;
		expect(parseStaticSvg(source)).toEqual({
			root: { preserveAspectRatio: 'none' },
			children: [
				{
					tag: 'rect',
					attributes: { width: '10', height: '12', fill: 'url(#tile)' },
					children: [],
				},
				{
					tag: 'defs',
					attributes: {},
					children: [
						{
							tag: 'pattern',
							attributes: { id: 'tile', width: '2', height: '3', patternUnits: 'userSpaceOnUse' },
							children: [
								{
									tag: 'path',
									attributes: { d: 'M0 0L2 3', stroke: 'currentColor', 'stroke-opacity': '0.5' },
									children: [],
								},
							],
						},
					],
				},
			],
		});
		expect(parsePathSvg(source)).toBeNull();
	});

	it.each([
		['a pattern with no local reference', `${path}${definition}`],
		['an unresolved paint server', `${painted.replace('#tile', '#other')}${definition}`],
		['an external paint server', `${painted.replace('#tile', 'other.svg#tile')}${definition}`],
		[
			'an implicit pattern coordinate system',
			`${painted}${definition.replace(' patternUnits="userSpaceOnUse"', '')}`,
		],
		['a noncanonical tile size', `${painted}${definition.replace('width="2"', 'width="02"')}`],
		['more than one tile child', `${painted}${definition.replace(tilePath, tilePath + path)}`],
		['a nested pattern definition', `${painted}<g>${definition}</g>`],
		['multiple definitions', `${painted}${definition}${definition}`],
	])('declines %s', (_, geometry) => {
		expect(parseStaticSvg(`<svg>${geometry}</svg>`)).toBeNull();
	});

	it('retains an authored unitful root length as a string', () => {
		expect(parseStaticSvg(`<svg width="1e999px">${path}</svg>`)?.root.width).toBe('1e999px');
	});

	it.each([
		['URL modules', 'data:image/svg+xml,caption'],
		['unknown XML namespaces', `<svg xmlns="urn:other">${path}</svg>`],
		['entities', '<svg><path d="M0&#x20;0"/></svg>'],
		['document type declarations', `<!DOCTYPE svg><svg>${path}</svg>`],
		['unknown attributes', '<svg><path d="M0 0" stroke-dasharray="2"/></svg>'],
		['unsupported path transform', '<svg><path d="M0 0" transform="rotate(2)"/></svg>'],
		['numeric loader normalization', `<svg width="01.00">${path}</svg>`],
		['noncanonical stroke width', '<svg><path d="M0 0" stroke-width=".5"/></svg>'],
		['duplicate attributes', `<svg width="1" width="2">${path}</svg>`],
		['unquoted attributes', '<svg><path d=M0/></svg>'],
		['XML-normalized tabs', `<svg viewBox="0\t0 1 1">${path}</svg>`],
		['XML-normalized newlines', '<svg><path d="M0\r\n0"/></svg>'],
		['missing attribute separators', '<svg><path d="M0 0"fill="red"/></svg>'],
		['multiple roots', `<svg>${path}</svg><svg>${path}</svg>`],
		['unclosed groups', `<svg><g>${path}</svg>`],
		['unexpected group end', `<svg>${path}</g></svg>`],
		['excessive nesting', `<svg>${'<g>'.repeat(1000)}${path}${'</g>'.repeat(1000)}</svg>`],
		['empty geometry', '<svg><!-- no shapes --><g></g></svg>'],
		['nested namespaces', `<svg><g xmlns="urn:other">${path}</g></svg>`],
		['named shapes', '<svg><rect width="2" height="2" id="button"/></svg>'],
		['external references', '<svg><use href="icon.svg#mark"/></svg>'],
		['inline styles', `<svg><g style="opacity:0.5">${path}</g></svg>`],
		['extra transform operations', `<svg><g transform="scale(1) rotate(2)">${path}</g></svg>`],
		['extra transform arguments', `<svg><g transform="translate(1 2 3)">${path}</g></svg>`],
		['incomplete matrix', '<svg><path d="M0 0" transform="matrix(1 0 0 1 2)"/></svg>'],
		['extra matrix argument', '<svg><path d="M0 0" transform="matrix(1 0 0 1 2 3 4)"/></svg>'],
		['nonfinite matrix', '<svg><path d="M0 0" transform="matrix(1 0 0 1 2 1e999)"/></svg>'],
		['noncanonical rectangle dimensions', '<svg><rect width="01" height="2"/></svg>'],
		['noncanonical opacity', '<svg><path d="M1 1" opacity=".3"/></svg>'],
		['out of range opacity', '<svg><path d="M1 1" opacity="2"/></svg>'],
		['unknown line caps', '<svg><path d="M1 1" stroke-linecap="circle"/></svg>'],
		['CSS variable fallbacks', '<svg><path d="M1 1" fill="var(--theme, red)"/></svg>'],
		[
			'additional paint declarations',
			'<svg><path d="M1 1" fill="var(--theme); stroke:red"/></svg>',
		],
		['comments within attributes', '<svg><path d="M0<!--note--> 0"/></svg>'],
		['multiple commented roots', `<svg>${path}</svg><!-- between --><svg>${path}</svg>`],
		['malformed prolog comments', `<!-- a--b --><svg>${path}</svg>`],
		['XML instructions', `<?xml version="1.0"?><svg>${path}</svg>`],
		['comments with an interior double hyphen', `<svg><!-- a--b -->${path}</svg>`],
		['comments with a trailing hyphen', `<svg><!--a--->${path}</svg>`],
		['invalid XML characters in comments', `<svg><!--\u0000-->${path}</svg>`],
		['scripts', `<svg>${path}<script>alert(1)</script></svg>`],
		['DOM event attributes', '<svg><path d="M0 0" onload="go()"/></svg>'],
		['paint references', '<svg><path d="M0 0" fill="url(#paint)"/></svg>'],
		['text nodes', `<svg>${path}text</svg>`],
		['truncated input', `<svg>${path}`],
		['paths without data', '<svg><path/></svg>'],
		['prototype properties', `<svg constructor="red">${path}</svg>`],
	])('declines %s', (_, source) => {
		expect(parseStaticSvg(source)).toBeNull();
	});
});

it('preserves the path-only return shape exported by previous generated helpers', () => {
	expect(parsePathSvg('<svg><path d="M0 0h1"/></svg>')).toEqual({
		root: {},
		paths: [{ d: 'M0 0h1' }],
	});
	expect(parsePathSvg('<svg><rect width="1" height="2"/></svg>')).toBeNull();
});
