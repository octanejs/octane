import { describe, expect, it } from 'vitest';
import { render } from '../src/index.ts';
import { renderMarkdown } from '../src/markdown.ts';
import {
	CodeBlockEmail,
	InvalidCodeBlockEmail,
	MarkdownEmail,
} from './_fixtures/rich-content.tsrx';

describe('rich email content', () => {
	it('renders styled Markdown through the public API', async () => {
		const html = await render(MarkdownEmail);

		expect(html).toContain('<div data-id="react-email-markdown">');
		expect(html).toContain(
			'<h1 style="font-weight:500;padding-top:20px;font-size:2.5rem">Hello</h1>',
		);
		expect(html).toContain('<p style="color:#123456">This is <strong');
		expect(html).toContain('href="https://octanejs.dev" target="_blank"');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>First</li>');
	});

	it('escapes HTML inside markdown code fences and spans', () => {
		const html = renderMarkdown(
			'Use `<script>alert(1)</script>` and:\n\n```js\n<img src=x>\n```\n',
		);
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('&lt;img src=x&gt;');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).not.toContain('<img src=x>');
	});

	it('escapes Markdown link and image attributes', () => {
		const html = renderMarkdown(
			`[Terms](https://example.com/?a=1&copy=2 'Say <hello> & "goodbye"')\n\n![A&B <C> 'D'](https://example.com/image?a=1&copy=2 'Title <x> & "y"')`,
		);

		expect(html).toContain(
			'href="https://example.com/?a=1&amp;copy=2" target="_blank" title="Say &lt;hello&gt; &amp; &quot;goodbye&quot;"',
		);
		expect(html).toContain(
			'src="https://example.com/image?a=1&amp;copy=2" alt="A&amp;B &lt;C&gt; &#39;D&#39;" title="Title &lt;x&gt; &amp; &quot;y&quot;"',
		);
	});

	it('renders syntax-highlighted code with optional line numbers', async () => {
		const html = await render(CodeBlockEmail);

		expect(html).toContain('<pre style="');
		expect(html).toContain('background:#1e1e1e');
		expect(html).toContain('>1</span>');
		expect(html).toContain('>2</span>');
		expect(html).toContain('color:#569cd6');
		expect(html).toContain('const');
		expect(html).toContain('answer');
	});

	it('rejects Prism languages that are not available', async () => {
		await expect(render(InvalidCodeBlockEmail)).rejects.toThrow(
			'CodeBlock: There is no language defined on Prism called not-a-language',
		);
	});
});
