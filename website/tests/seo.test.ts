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

	it('head ships social-preview tags and the card image they point at', () => {
		const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf-8');
		// Prettier may wrap a long tag across lines, so \s+ must span newlines.
		const meta = (attr: string, key: string) =>
			html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]+)"`))?.[1];

		expect(meta('property', 'og:title')).toBeTruthy();
		expect(meta('property', 'og:description')).toBeTruthy();
		expect(meta('name', 'twitter:card')).toBe('summary_large_image');

		// Scrapers fetch og:image without resolving relative URLs reliably, so the
		// tag must be absolute — and the file it names must actually ship.
		const image = meta('property', 'og:image');
		expect(image).toMatch(/^https:\/\/octanejs\.dev\//);
		const file = new URL(image!).pathname.replace(/^\//, '');
		expect(fs.existsSync(`${publicDir}/${file}`), file).toBe(true);

		// 1200×630 is the summary_large_image aspect every major scraper crops to;
		// read the dimensions from the PNG IHDR so a regenerated image can't drift.
		const png = fs.readFileSync(`${publicDir}/${file}`);
		expect(png.readUInt32BE(16)).toBe(Number(meta('property', 'og:image:width') ?? 1200));
		expect(png.readUInt32BE(20)).toBe(Number(meta('property', 'og:image:height') ?? 630));
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
	});

	it('ships every icon the head tags and manifest reference', () => {
		const html = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf-8');
		const manifest = JSON.parse(read('site.webmanifest'));
		const referenced = new Set<string>();
		for (const m of html.matchAll(/(?:href)="\/([^"]+\.(?:ico|png|svg|webmanifest))"/g)) {
			referenced.add(m[1]);
		}
		for (const icon of manifest.icons) referenced.add(icon.src.replace(/^\//, ''));
		expect(referenced.size).toBeGreaterThanOrEqual(5);
		for (const file of referenced) {
			expect(fs.existsSync(`${publicDir}/${file}`), file).toBe(true);
		}
	});
});
