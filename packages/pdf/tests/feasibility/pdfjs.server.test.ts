import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('react-pdf U1 — PDF.js server feasibility', () => {
	// @parity-case adapted:react-pdf-legacy-node
	it('imports the pinned legacy PDF.js build in a pristine Node process', async () => {
		const { stdout, stderr } = await execFileAsync(process.execPath, [
			'--input-type=module',
			'--eval',
			`const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
			 console.log(JSON.stringify({
			   version: pdfjs.version,
			   getDocument: typeof pdfjs.getDocument,
			   hasWindow: 'window' in globalThis,
			   hasDocument: 'document' in globalThis,
			 }));`,
		]);

		expect(stderr).toBe('');
		expect(JSON.parse(stdout)).toEqual({
			version: '5.4.296',
			getDocument: 'function',
			hasWindow: false,
			hasDocument: false,
		});
	});

	// @parity-case adapted:react-pdf-modern-node-boundary
	it('proves the modern PDF.js entry is not directly safe in pristine Node', async () => {
		await expect(
			execFileAsync(process.execPath, [
				'--input-type=module',
				'--eval',
				"await import('pdfjs-dist/build/pdf.mjs');",
			]),
		).rejects.toMatchObject({
			stderr: expect.stringMatching(/DOMMatrix is not defined/),
		});
	});
});
