import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountDifferential, normaliseHtml } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(import.meta.dirname, '../_fixtures/markdown-parity.tsrx');
const featureFixture = resolve(import.meta.dirname, '../_fixtures/feature-parity.tsrx');
const cache = resolve(import.meta.dirname, '.react-cache');

function normaliseUpstreamIconSizes(html: string): string {
	return html.replace(/<svg\b[^>]*>/g, (svg) => {
		if (!svg.includes('viewBox="0 0 16 16"')) {
			return svg;
		}

		const size = svg.match(/ size="([^"]+)"/)?.[1];
		if (!size) {
			return svg;
		}

		return svg
			.replace(' height="16"', ` height="${size}"`)
			.replace(` size="${size}"`, '')
			.replace(' width="16"', ` width="${size}"`);
	});
}

function normaliseUpstreamKnownDefects(html: string): string {
	const normalised = normaliseHtml(html)
		.replaceAll('bg-[var(--sdm-bg,inherit]', 'bg-[var(--sdm-bg,inherit)]')
		.replaceAll(
			'dark:bg-[var(--shiki-dark-bg,var(--sdm-bg,inherit)]',
			'dark:bg-[var(--shiki-dark-bg,var(--sdm-bg,inherit))]',
		);

	return normaliseUpstreamIconSizes(normalised);
}

function expectUpstreamCodeBlockParity(octaneHtml: string, reactHtml: string): void {
	expect(normaliseHtml(octaneHtml)).toBe(normaliseUpstreamKnownDefects(reactHtml));
}

// Streamdown 2.5 shares animation progress across sibling blocks. Compare every
// other DOM detail with upstream, then assert the corrected timing separately.
function normaliseAnimationTiming(html: string): string {
	return normaliseHtml(html).replace(/ ?--sd-(?:duration|delay): \d+ms;/g, '');
}

function expectUpstreamAnimationParity(octaneHtml: string, reactHtml: string): void {
	expect(normaliseAnimationTiming(octaneHtml)).toBe(normaliseAnimationTiming(reactHtml));
}

const STATIC_MARKDOWN = [
	'# Streamdown',
	'',
	'Hello **Octane** and 你好，世界。',
	'',
	'| Runtime | Status |',
	'| --- | --- |',
	'| Octane | ready |',
	'',
	'Block math:',
	'',
	'$$a^2 + b^2 = c^2$$',
	'',
	'<mention user_id="42">_literal_name_</mention>',
].join('\n');

describe('@octanejs/streamdown differential parity', () => {
	it('matches Streamdown 2.5 for static Markdown, GFM, math, CJK, and custom tags', async () => {
		const differential = await mountDifferential(
			fixture,
			'MarkdownParity',
			{ content: STATIC_MARKDOWN },
			cache,
		);

		await differential.step('static document', (octane, react) => {
			expect(octane.find('h1').textContent).toBe('Streamdown');
			expect(react.find('h1').textContent).toBe('Streamdown');
			expect(octane.find('table').textContent).toContain('Octaneready');
			expect(octane.find('.katex')).toBeDefined();
			expect(octane.find('mention').textContent).toBe('_literal_name_');
		});

		differential.unmount();
	});

	it('preserves completed blocks while appending streamed Markdown', async () => {
		const differential = await mountDifferential(
			fixture,
			'StreamingMarkdownParity',
			{ content: '# Initial\n\nFirst block.' },
			cache,
		);

		const firstOctaneHeading = differential.octane.find('h1');
		await differential.observe('initial stream', () => {});
		expectUpstreamAnimationParity(
			differential.octane.container.innerHTML,
			differential.react.container.innerHTML,
		);
		for (const animatedText of differential.octane.findAll('[data-sd-animate]')) {
			expect((animatedText as HTMLElement).style.getPropertyValue('--sd-duration')).toBe('100ms');
		}
		expect(
			(differential.octane.findAll('p [data-sd-animate]')[1] as HTMLElement).style.getPropertyValue(
				'--sd-delay',
			),
		).toBe('40ms');

		await differential.observe('append block', async (octane, react) => {
			await octane.click('#append-markdown');
			await react.click('#append-markdown');
		});
		expectUpstreamAnimationParity(
			differential.octane.container.innerHTML,
			differential.react.container.innerHTML,
		);
		for (const animatedText of differential.octane.findAll('h2 [data-sd-animate]')) {
			expect((animatedText as HTMLElement).style.getPropertyValue('--sd-duration')).toBe('100ms');
		}

		expect(differential.octane.find('h1')).toBe(firstOctaneHeading);
		expect(differential.octane.findAll('h2')).toHaveLength(1);
		differential.unmount();
	});

	it('preserves HAST nodes, custom components, inline code, and custom renderers', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'HastComponentsParity',
			{
				content: [
					'# Custom heading',
					'',
					'Inline `value`.',
					'',
					'```demo title="sample"',
					'custom source',
					'```',
				].join('\n'),
			},
			cache,
		);

		await differential.step('custom HAST projection', (octane, react) => {
			for (const runtime of [octane, react]) {
				expect(runtime.find('[data-testid="custom-heading"]').getAttribute('data-hast-node')).toBe(
					'h1',
				);
				expect(
					runtime.find('[data-testid="custom-inline-code"]').getAttribute('data-hast-node'),
				).toBe('code');
				expect(runtime.find('[data-testid="custom-renderer"]').textContent).toContain(
					'custom source',
				);
				expect(runtime.find('[data-testid="custom-renderer"]').getAttribute('data-meta')).toBe(
					'title="sample"',
				);
			}
		});

		differential.unmount();
	});

	it('matches element filtering, unwrapping, and URL transformation', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'FilteringParity',
			{ content: 'Keep *this text* and [visit](https://example.com/path).' },
			cache,
		);

		await differential.step('filtered document', (octane, react) => {
			for (const runtime of [octane, react]) {
				expect(runtime.findAll('em')).toHaveLength(0);
				expect(runtime.find('p').textContent).toContain('Keep this text');
				expect(runtime.find('a').getAttribute('href')).toBe(
					'https://safe.invalid/?target=https%3A%2F%2Fexample.com%2Fpath',
				);
			}
		});

		differential.unmount();
	});

	it('renders the documented code and table control surface', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'ControlsParity',
			{
				content: [
					'```ts startLine=10',
					'const answer = 42;',
					'```',
					'',
					'| Name | Value |',
					'| --- | --- |',
					'| answer | 42 |',
				].join('\n'),
			},
			cache,
		);

		await differential.observe('control surface', (octane, react) => {
			for (const runtime of [octane, react]) {
				expect(runtime.findAll('[data-streamdown="code-block"]')).toHaveLength(1);
				expect(runtime.findAll('[data-streamdown="code-block-copy-button"]')).toHaveLength(1);
				expect(runtime.findAll('[data-streamdown="code-block-download-button"]')).toHaveLength(1);
				expect(runtime.findAll('[data-streamdown="table-wrapper"]')).toHaveLength(1);
				expect(runtime.find('table').textContent).toContain('answer42');
			}

			const octanePre = octane.find('[data-streamdown="code-block-body"] pre');
			expect(octanePre.classList.contains('bg-[var(--sdm-bg,inherit)]')).toBe(true);
			expect(
				octanePre.classList.contains('dark:bg-[var(--shiki-dark-bg,var(--sdm-bg,inherit))]'),
			).toBe(true);

			// Streamdown 2.5.0 ships unbalanced arbitrary-value classes and leaves
			// icon size props inert. Keep the rest of this scenario byte-identical
			// while normalising only those upstream defects on the React side.
			expectUpstreamCodeBlockParity(octane.container.innerHTML, react.container.innerHTML);
		});

		differential.unmount();
	});

	it('survives append, shrink, and static/streaming mode round trips', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'ModeTransitionsParity',
			{ content: '# Initial\n\nFirst block.\n\n```ts\nconst pending =' },
			cache,
		);

		await differential.observe('initial incomplete stream', () => {});
		expectUpstreamCodeBlockParity(
			differential.octane.container.innerHTML,
			differential.react.container.innerHTML,
		);
		await differential.step('stream to static', async (octane, react) => {
			await octane.click('#to-static');
			await react.click('#to-static');
		});
		expect(differential.octane.find('h1').textContent).toBe('Static');

		await differential.step('static to streaming', async (octane, react) => {
			await octane.click('#to-streaming');
			await react.click('#to-streaming');
		});
		await differential.step('append streaming block', async (octane, react) => {
			await octane.click('#append-stream');
			await react.click('#append-stream');
		});
		expect(differential.octane.findAll('h2')).toHaveLength(1);

		await differential.step('shrink streaming document', async (octane, react) => {
			await octane.click('#shrink-stream');
			await react.click('#shrink-stream');
		});
		expect(differential.octane.find('h1').textContent).toBe('Short');
		expect(differential.octane.findAll('h2')).toHaveLength(0);

		differential.unmount();
	});

	it('matches the custom link-safety modal lifecycle', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'LinkSafetyParity',
			{ content: '[external](https://example.com/safe)' },
			cache,
		);

		await differential.step('closed modal', (octane, react) => {
			expect(octane.findAll('[data-testid="safety-modal"]')).toHaveLength(0);
			expect(react.findAll('[data-testid="safety-modal"]')).toHaveLength(0);
		});
		await differential.step('open modal', async (octane, react) => {
			await octane.click('[data-streamdown="link"]');
			await react.click('[data-streamdown="link"]');
		});
		expect(differential.octane.find('[data-testid="safety-modal"]').textContent).toContain(
			'https://example.com/safe',
		);
		await differential.step('close modal', async (octane, react) => {
			await octane.click('#close-safety-modal');
			await react.click('#close-safety-modal');
		});
		expect(differential.octane.findAll('[data-testid="safety-modal"]')).toHaveLength(0);

		differential.unmount();
	});

	it('matches animation start and end callbacks', async () => {
		const differential = await mountDifferential(
			featureFixture,
			'AnimationLifecycleParity',
			undefined,
			cache,
		);

		await differential.step('animation idle', (octane, react) => {
			expect(octane.find('[data-testid="animation-events"]').textContent).toBe('0:0');
			expect(react.find('[data-testid="animation-events"]').textContent).toBe('0:0');
		});
		await differential.step('animation starts', async (octane, react) => {
			await octane.click('#start-animation');
			await react.click('#start-animation');
		});
		expect(differential.octane.find('[data-testid="animation-events"]').textContent).toBe('1:0');
		await differential.step('animation ends', async (octane, react) => {
			await octane.click('#stop-animation');
			await react.click('#stop-animation');
		});
		expect(differential.octane.find('[data-testid="animation-events"]').textContent).toBe('1:1');

		differential.unmount();
	});
});
