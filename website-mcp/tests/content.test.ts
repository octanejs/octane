// The content snapshot is the remote server's entire knowledge: these tests
// pin that the build-time imports actually captured the corpus (and stay in
// sync with the sources they mirror), because an empty snapshot would deploy
// and serve successfully — just uselessly.
import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DOCS, DOC_SLUGS, docBySlug } from '../src/content/docs.ts';
import { BINDING_CATEGORIES, BINDING_STATUSES, resolveBinding } from '../src/content/bindings.ts';
import { SKILLS, SKILL_NAMES } from '../src/content/skills.ts';
import { LLMS_TXT, LLMS_FULL_TXT } from '../src/content/llms.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('docs snapshot', () => {
	it('carries every website doc plus the repo deep dives', async () => {
		const websiteDocs = (await readdir(join(repoRoot, 'website/src/content/docs'))).map((file) =>
			file.replace(/\.mdx$/, ''),
		);
		const snapshotWebsiteSlugs = DOCS.filter((doc) => doc.source === 'website').map(
			(doc) => doc.slug,
		);
		expect(new Set(snapshotWebsiteSlugs)).toEqual(new Set(websiteDocs));
		expect(DOC_SLUGS).toContain('deferred-hydration-reference');
		expect(DOC_SLUGS).toContain('ssr');
		expect(DOC_SLUGS).toContain('differences-from-react-reference');
	});

	it('serves substantial markdown with frontmatter stripped', () => {
		for (const doc of DOCS) {
			expect(doc.markdown.length, doc.slug).toBeGreaterThan(500);
			expect(doc.markdown.startsWith('---'), doc.slug).toBe(false);
			expect(doc.url).toMatch(/^https:\/\//);
		}
	});

	it('sections the repo markdown docs by their ## headings', () => {
		const deferredHydration = docBySlug('deferred-hydration-reference')!;
		const ssr = docBySlug('ssr')!;
		const reference = docBySlug('differences-from-react-reference')!;
		expect(deferredHydration.sections.length).toBeGreaterThanOrEqual(3);
		expect(ssr.sections.length).toBeGreaterThanOrEqual(5);
		expect(reference.sections.length).toBeGreaterThanOrEqual(15);
		for (const section of [...deferredHydration.sections, ...ssr.sections, ...reference.sections]) {
			expect(section.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
		}
	});
});

describe('bindings snapshot', () => {
	it('captures every package status.json exactly once', async () => {
		const packages = await readdir(join(repoRoot, 'packages'), { withFileTypes: true });
		const withStatus = [];
		for (const entry of packages) {
			if (!entry.isDirectory()) continue;
			try {
				await readFile(join(repoRoot, 'packages', entry.name, 'status.json'));
				withStatus.push(entry.name);
			} catch {
				// no status.json — not a binding
			}
		}
		expect(new Set(BINDING_STATUSES.map((status) => status.dir))).toEqual(new Set(withStatus));
		expect(BINDING_STATUSES.length).toBeGreaterThan(20);
	});

	it('matches the curated catalog package-for-package', () => {
		const catalogued = BINDING_CATEGORIES.flatMap((category) => category.packages);
		expect(new Set(BINDING_STATUSES.map((status) => status.package))).toEqual(new Set(catalogued));
	});

	it('resolves npm name, directory name, and React upstream name', () => {
		expect(resolveBinding('@octanejs/zustand')?.package).toBe('@octanejs/zustand');
		expect(resolveBinding('zustand')?.package).toBe('@octanejs/zustand');
		expect(resolveBinding('@tanstack/react-query')?.package).toBe('@octanejs/tanstack-query');
		expect(resolveBinding('not-a-binding')).toBeUndefined();
	});
});

describe('skills snapshot', () => {
	it('byte-matches the markdown shipped by @octanejs/mcp-server', async () => {
		const skillsDir = join(repoRoot, 'packages/octane-mcp-server/skills');
		const files = (await readdir(skillsDir)).filter((file) => file.endsWith('.md'));
		expect(new Set(SKILL_NAMES)).toEqual(new Set(files.map((file) => file.replace(/\.md$/, ''))));
		for (const file of files) {
			expect(SKILLS[file.replace(/\.md$/, '')]).toBe(await readFile(join(skillsDir, file), 'utf8'));
		}
	});
});

describe('llms text', () => {
	it('serves the website llms.txt verbatim', async () => {
		expect(LLMS_TXT).toBe(await readFile(join(repoRoot, 'website/public/llms.txt'), 'utf8'));
		for (const marker of [
			'## Deferred hydration',
			'<Hydrate when={visible',
			'split={false}',
			'prefetch={idle()}',
			'onHydrated',
		]) {
			expect(LLMS_TXT).toContain(marker);
		}
	});

	it('llms-full.txt extends llms.txt with the whole docs corpus', () => {
		expect(LLMS_FULL_TXT.startsWith(LLMS_TXT.trimEnd())).toBe(true);
		for (const doc of DOCS) {
			expect(LLMS_FULL_TXT).toContain(`# ${doc.title}`);
			expect(LLMS_FULL_TXT).toContain(doc.url);
		}
	});
});
