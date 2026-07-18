// @vitest-environment node
//
// Published SEO artifacts. The sitemap and robots.txt are static files in
// public/, so nothing regenerates them when a doc is added — these assertions
// are what keeps them honest.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docs } from '../src/content/docs.ts';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const read = (name: string) => fs.readFileSync(`${publicDir}/${name}`, 'utf-8');

describe('seo artifacts', () => {
	it('sitemap lists the site routes and every published doc', () => {
		const sitemap = read('sitemap.xml');
		for (const path of ['/', '/docs', '/benchmarks', '/playground']) {
			expect(sitemap).toContain(`<loc>https://octanejs.dev${path}</loc>`);
		}
		for (const doc of docs) {
			expect(sitemap, doc.slug).toContain(`<loc>https://octanejs.dev/docs/${doc.slug}</loc>`);
		}
		// No stale entries: every listed URL is one of the above.
		const listed = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
		expect(listed).toHaveLength(4 + docs.length);
	});

	it('robots.txt allows crawling and points at the sitemap', () => {
		const robots = read('robots.txt');
		expect(robots).toContain('User-agent: *');
		expect(robots).not.toContain('Disallow: /');
		expect(robots).toContain('Sitemap: https://octanejs.dev/sitemap.xml');
	});

	it('ships every icon the head tags and manifest reference', () => {
		const manifest = JSON.parse(read('site.webmanifest'));
		const referenced = new Set<string>([
			'favicon.ico',
			'favicon.svg',
			'apple-touch-icon.png',
			'site.webmanifest',
		]);
		for (const icon of manifest.icons) referenced.add(icon.src.replace(/^\//, ''));
		expect(referenced.size).toBeGreaterThanOrEqual(5);
		for (const file of referenced) {
			expect(fs.existsSync(`${publicDir}/${file}`), file).toBe(true);
		}
	});
});
