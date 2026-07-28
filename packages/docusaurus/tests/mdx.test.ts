import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import * as ServerMdx from '@octanejs/mdx/server';
import { evalModuleCode, stripMarkers } from '../../mdx/tests/_helpers.js';
import { compileDocusaurusMdxSync, remarkDocusaurusPageData } from '../src/mdx.js';
import { docusaurusMdx } from '../src/vite.js';

const SOURCE = `---
title: Guide
---

# Guide

## Install

### Install

[Next](./next.md)

![Logo](./logo.png)
`;

describe('Docusaurus-aware MDX', () => {
	it('emits the Docusaurus document export surface through Octane compilation', () => {
		const options = {
			metadata: {
				id: 'guide',
				frontMatter: { image: './social.png' },
			},
			resolveMarkdownLink: ({ linkPathname }) => linkPathname.replace('./', '/guide/'),
			resolveMarkdownImage: ({ url }) => url.replace('./', '/assets/'),
			createAssets: ({ frontMatter }) => ({ image: frontMatter.image }),
		};
		const result = compileDocusaurusMdxSync(SOURCE, '/site/docs/guide.mdx', options);

		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain('export const frontMatter = frontmatter');
		expect(result.code).toContain('export const contentTitle = "Guide"');
		const serverResult = compileDocusaurusMdxSync(SOURCE, '/site/docs/guide.mdx', {
			...options,
			mode: 'server',
		});
		const compiledModule = evalModuleCode(serverResult.code, {
			'octane/server': ServerRuntime,
			'@octanejs/mdx/server': ServerMdx,
		});
		const { html } = ServerRuntime.renderToString(compiledModule.default, {});
		expect(stripMarkers(html)).toContain('<header><h1 id="guide">Guide</h1></header>');
		expect(result.code).toContain('id: "install"');
		expect(result.code).toContain('id: "install-1"');
		expect(result.code).toContain('"/guide/next.md"');
		expect(result.code).toContain('"/assets/logo.png"');
		expect(result.code).toContain('export const metadata =');
		expect(result.code).toContain('export const assets =');
		expect(result.code).toContain('"./social.png"');
	});

	it('supports explicit heading IDs and preserves Markdown query fragments', () => {
		const result = compileDocusaurusMdxSync(
			`## Install {#custom-id}\n\n[Next](./next.mdx?tab=api#usage)`,
			'/site/docs/guide.mdx',
			{
				resolveMarkdownLink: ({ linkPathname }) =>
					linkPathname === './next.mdx' ? '/guide/next' : null,
			},
		);

		expect(result.code).toContain('id: "custom-id"');
		expect(result.code).not.toContain('{#custom-id}');
		expect(result.code).toContain('"/guide/next?tab=api#usage"');
		expect(result.code).toContain('export const contentTitle = undefined');
	});

	it('preserves heading examples inside fenced code blocks', () => {
		const source = [
			'```md',
			'# Backtick example {#backtick-id}',
			'```',
			'',
			'~~~md',
			'# Tilde example {#tilde-id}',
			'~~~',
			'',
			'## Actual heading {#actual-id}',
		].join('\n');

		const result = compileDocusaurusMdxSync(source, '/site/docs/code-examples.mdx');

		expect(result.diagnostics).toEqual([]);
		expect(result.code).toContain('"# Backtick example {#backtick-id}\\n"');
		expect(result.code).toContain('"# Tilde example {#tilde-id}\\n"');
		expect(result.code).toContain('id: "actual-id"');
		expect(result.code).not.toContain('\\{#backtick-id}');
		expect(result.code).not.toContain('\\{#tilde-id}');
	});

	it('can remove the first h1 while retaining it as contentTitle', () => {
		const tree = {
			type: 'root',
			children: [
				{ type: 'heading', depth: 1, children: [{ type: 'text', value: 'Guide' }] },
				{ type: 'paragraph', children: [{ type: 'text', value: 'Body' }] },
			],
		};
		const file = { path: '/guide.mdx', data: {} };

		remarkDocusaurusPageData({ removeContentTitle: true })(tree, file);

		expect(tree.children).toHaveLength(1);
		expect(tree.children[0].type).toBe('paragraph');
	});

	it('integrates with the Vite transform boundary and skips asset queries', async () => {
		const metadata = vi.fn(() => ({ id: 'guide' }));
		const plugin = docusaurusMdx({ metadata });
		plugin.configResolved({ root: '/site', command: 'build' });
		const context = { addWatchFile: vi.fn(), warn: vi.fn() };

		const result = await plugin.transform.call(context, SOURCE, '/site/docs/guide.mdx', {
			ssr: true,
		});
		const asset = await plugin.transform.call(context, SOURCE, '/site/docs/guide.mdx?raw');

		expect(result?.code).toContain('export const metadata =');
		expect(metadata).toHaveBeenCalledWith('/site/docs/guide.mdx');
		expect(asset).toBeNull();
	});
});
