import { describe, expect, it } from 'vitest';
import { maskOctaneRouteSource } from '../../src/generator-plugin.js';

// The route generator feeds EVERY route file through transformRouteSource.
// Only .tsrx carries the native template dialect — plain .ts server routes
// (tanstack.com's rss[.]xml.ts / robots[.]txt.ts shape) must pass through
// verbatim: the TSRX parser is not a general TS parser and rejected valid
// TS route files (found by the tanstack-com bench port).
describe('maskOctaneRouteSource', () => {
	it('passes plain .ts route files through unchanged', () => {
		const source = [
			"import { createFileRoute } from '@octanejs/tanstack-router';",
			'',
			"export const Route = createFileRoute('/rss[.]xml')({",
			'\tserver: {',
			'\t\thandlers: {',
			'\t\t\tGET: async () => {',
			"\t\t\t\tconst body: string = ['<rss>', '</rss>'].join('\\n');",
			'\t\t\t\treturn new Response(body, {',
			"\t\t\t\t\theaders: { 'Content-Type': 'application/rss+xml' },",
			'\t\t\t\t});',
			'\t\t\t},',
			'\t\t},',
			'\t},',
			'});',
		].join('\n');
		expect(maskOctaneRouteSource(source, '/routes/rss[.]xml.ts')).toBe(source);
	});

	it('still masks native template bodies in .tsrx files', () => {
		const source = [
			"import { createFileRoute } from '@octanejs/tanstack-router';",
			'',
			"export const Route = createFileRoute('/')({ component: Home });",
			'',
			'function Home() @{',
			'\t<p>home</p>',
			'}',
		].join('\n');
		const masked = maskOctaneRouteSource(source, '/routes/index.tsrx');
		expect(masked).not.toContain('@{');
		expect(masked).not.toContain('<p>');
		expect(masked.length).toBe(source.length);
	});
});
