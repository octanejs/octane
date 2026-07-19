// @vitest-environment node
//
// Published SEO artifacts. The sitemap and robots.txt are static files in
// public/, so nothing regenerates them when a doc is added — these assertions
// are what keeps them honest.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { docs } from '../src/content/docs.ts';
import { SITE_TITLE } from '../src/constants/site.ts';
import { Route as RootRoute } from '../src/routes/__root.tsrx';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const read = (name: string) => fs.readFileSync(`${publicDir}/${name}`, 'utf-8');
// `head` is typed `Awaitable` (a route may resolve it asynchronously); the root
// route's is a plain sync object — `await` unwraps the union either way.
const head = await RootRoute.options.head!({} as never);
const meta = (key: string): string | undefined => {
	// `MetaDescriptor` is a union of tag shapes (title/name/property/…); read
	// through its `Record<string, unknown>` arm to match on either key form.
	for (const entry of head.meta ?? []) {
		if (entry === undefined) continue;
		const record: Record<string, unknown> = entry;
		if (record.property === key || record.name === key) {
			return typeof record.content === 'string' ? record.content : undefined;
		}
	}
	return undefined;
};

describe('seo artifacts', () => {
	it('sitemap lists the site routes and every published doc', () => {
		const sitemap = read('sitemap.xml');
		for (const path of ['/', '/docs', '/benchmarks', '/playground', '/errors']) {
			expect(sitemap).toContain(`<loc>https://octanejs.dev${path}</loc>`);
		}
		for (const doc of docs) {
			expect(sitemap, doc.slug).toContain(`<loc>https://octanejs.dev/docs/${doc.slug}</loc>`);
		}
		// No stale entries: every listed URL is one of the above.
		const listed = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
		expect(listed).toHaveLength(5 + docs.length);
	});

	it('robots.txt allows crawling and points at the sitemap', () => {
		const robots = read('robots.txt');
		expect(robots).toContain('User-agent: *');
		expect(robots).not.toContain('Disallow: /');
		expect(robots).toContain('Sitemap: https://octanejs.dev/sitemap.xml');
	});

	it('head ships social-preview tags and the card image they point at', () => {
		expect(meta('og:title')).toBeTruthy();
		expect(meta('og:description')).toBeTruthy();
		expect(meta('twitter:card')).toBe('summary_large_image');

		// Scrapers fetch og:image without resolving relative URLs reliably, so the
		// tag must be absolute — and the file it names must actually ship.
		const image = meta('og:image');
		expect(image).toMatch(/^https:\/\/octanejs\.dev\//);
		const file = new URL(image!).pathname.replace(/^\//, '');
		expect(fs.existsSync(`${publicDir}/${file}`), file).toBe(true);

		// 1200×630 is the summary_large_image aspect every major scraper crops to;
		// read the dimensions from the PNG IHDR so a regenerated image can't drift.
		const png = fs.readFileSync(`${publicDir}/${file}`);
		expect(png.readUInt32BE(16)).toBe(Number(meta('og:image:width') ?? 1200));
		expect(png.readUInt32BE(20)).toBe(Number(meta('og:image:height') ?? 630));
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
	});

	it('root route title matches the SITE_TITLE constant restored after navigation', () => {
		// useTitle resets document.title to SITE_TITLE on unmount; if that drifts
		// from the served <title>, leaving a doc page would flicker a different tab
		// title. Keep the two byte-identical.
		expect(head.meta).toContainEqual({ title: SITE_TITLE });
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
