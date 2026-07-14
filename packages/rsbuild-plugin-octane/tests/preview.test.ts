// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const previewEntry = fileURLToPath(new URL('../src/bin/preview.js', import.meta.url));
const temporaryRoots: string[] = [];
const children = new Set<ChildProcess>();

afterEach(() => {
	for (const child of children) child.kill('SIGKILL');
	children.clear();
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('octane-rsbuild-preview', () => {
	it('terminates with the same signal when the server child exits by signal', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'octane-rsbuild-preview-'));
		temporaryRoots.push(root);
		writeFileSync(path.join(root, 'entry.js'), "process.kill(process.pid, 'SIGTERM');\n");

		const child = spawn(process.execPath, [previewEntry, '--root', root, 'entry.js'], {
			stdio: 'pipe',
		});
		children.add(child);

		const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
			(resolve, reject) => {
				const timeout = setTimeout(() => {
					child.kill('SIGKILL');
					reject(new Error('Preview process did not terminate after its child exited by signal.'));
				}, 5_000);

				child.once('error', (error) => {
					clearTimeout(timeout);
					reject(error);
				});
				child.once('exit', (code, signal) => {
					clearTimeout(timeout);
					resolve({ code, signal });
				});
			},
		);
		children.delete(child);

		expect(result).toEqual({ code: null, signal: 'SIGTERM' });
	});
});
