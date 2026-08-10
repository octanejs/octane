import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const adoptionRoot = fileURLToPath(new URL('.', import.meta.url));
const read = (relative: string) => readFileSync(join(adoptionRoot, relative), 'utf8');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('frozen adoption inputs', () => {
	it('retains the attribution-compatible public application consumer byte-exact', () => {
		const source = read('public-app/MarkdownBlock.react.tsx');
		expect(sha256(source)).toBe('a1c28bca40d07ec3ad2c5971fd35243b37b0b31e2cb9717b502dc1ff825d24f4');
		expect(source).toContain('import ReactMarkdown from "react-markdown"');
		expect(source).toContain('remarkPlugins=');
		expect(source).toContain('rehypePlugins=');
		expect(source).toContain('components={components}');
	});

	it('freezes every migration-sensitive API family before implementation', () => {
		const canonical = read('canonical/react-markdown-examples.react.tsx');
		const conversion = read('consumer.tsrx');
		for (const identity of [
			'MarkdownAsync',
			'MarkdownHooks',
			'defaultUrlTransform',
			'Components',
			'Options',
			'remarkPlugins',
			'rehypePlugins',
			'components',
		]) {
			expect(canonical).toContain(identity);
			expect(conversion).toContain(identity);
		}
	});

	it('separates framework-wide edits from forbidden library redesign', () => {
		const ledger = read('MIGRATION.md');
		expect(ledger).toContain('ordinary React-to-Octane conversion');
		expect(ledger).toContain('Must remain unchanged');
		expect(ledger).toContain('requires no new renderer API');
		expect(ledger).toContain('public package entry point');
	});
});
