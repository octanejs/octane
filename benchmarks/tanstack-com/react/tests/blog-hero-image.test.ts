import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFirstImageSrc, parseSiteMarkdown } from '../src/utils/markdown';

// Guards the eagerFirstImage optimization (blog.$.tsx -> Markdown ->
// findFirstImageSrc): if a future post's structure stops the walker before
// its first image (e.g. a list/table/blockquote appears earlier in the
// document), the post silently falls back to lazy-loading its hero image
// instead of failing loudly. This test makes that regression visible.

const blogDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/blog');

function stripFrontmatter(content: string) {
	const match = content.match(/^---\n[\s\S]*?\n---\n?/);
	return match ? content.slice(match[0].length) : content;
}

const postFiles = fs.readdirSync(blogDir).filter((file) => file.endsWith('.md'));

assert.ok(postFiles.length > 0, 'expected to find blog posts in src/blog');

for (const file of postFiles) {
	const raw = fs.readFileSync(path.join(blogDir, file), 'utf-8');
	const body = stripFrontmatter(raw);
	const hasBodyImage = /!\[[^\]]*\]\([^)]+\)/.test(body);

	if (!hasBodyImage) continue;

	const document = parseSiteMarkdown(body);
	const firstImageSrc = findFirstImageSrc(document);

	assert.notEqual(
		firstImageSrc,
		undefined,
		`${file} contains a body image but findFirstImageSrc() returned ` +
			`undefined - its first image is no longer reachable through plain ` +
			`paragraphs/headings, so the blog hero eager-load optimization is ` +
			`silently disabled for this post`,
	);
}

console.log('blog-hero-image tests passed');
