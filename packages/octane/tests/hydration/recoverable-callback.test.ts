// React 19 root option parity: hydrateRoot's onRecoverableError. Octane recovers
// hydration mismatches per site (patch/rebuild in place) rather than client-
// rendering a whole boundary, so the callback contract is: fire (dev AND prod)
// after hydration recovered from a STRUCTURAL server/client divergence —
// rebuilt subtrees, discarded stale server ranges — coalesced to one report per
// root per microtask burst. Attribute-level value patches do not report: React
// production hydration does not detect those at all, so reporting them would
// make Octane's extra detection a behavioral difference.
// The callback receives only the error (no errorInfo/componentStack), matching
// the documented SSR onError shape.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

const SWAP = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/swap.tsrx');

function serverModule(fixture: string, file: string): Record<string, any> {
	return loadServerFixture(fixture, { id: file });
}

function clientModule(fixture: string, file: string, dev: boolean): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), {
		id: file,
		mode: 'client',
		compileOptions: { dev },
	});
}

describe('hydrateRoot — onRecoverableError', () => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const srv = serverModule(SWAP, 'swap.tsrx');
	const cliDev = clientModule(SWAP, 'swap.tsrx', true);
	const cliProd = clientModule(SWAP, 'swap.tsrx', false);

	it('fires after a structural mismatch recovery (dev compile)', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		// Recovery itself is synchronous; the report is delivered post-burst.
		await Promise.resolve();
		expect(container.querySelector('b.inner')).not.toBeNull();
		expect(container.querySelector('p.host')).toBeNull();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
		expect(String((onRecoverableError.mock.calls[0][0] as Error).message)).toMatch(/hydration/i);
	});

	it('fires in PROD compile too (recovery runs everywhere; only the warning is dev-only)', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliProd.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(container.querySelector('b.inner')).not.toBeNull();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('coalesces to one report per root per burst', async () => {
		// Server renders BOTH divergent spots (host branch); the client flips the
		// branch AND the inner label — still a single report for the burst.
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('keeps recoverable reports isolated between separate hydrating roots', async () => {
		const other = document.createElement('div');
		document.body.appendChild(other);
		try {
			const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
			container.innerHTML = html;
			other.innerHTML = html;
			const first = vi.fn();
			const second = vi.fn();
			hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError: first });
			hydrateRoot(other, cliDev.Swap, { host: false }, { onRecoverableError: second });
			flushSync(() => {});
			await Promise.resolve();
			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
			expect(container.querySelector('b.inner')).not.toBeNull();
			expect(other.querySelector('b.inner')).not.toBeNull();
		} finally {
			other.remove();
		}
	});

	it('retains the recovery report when the root updates before callback delivery', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => root.render(cliDev.Swap, { host: true }));
		expect(container.querySelector('p.host')).not.toBeNull();
		expect(onRecoverableError).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('reports a throwing recovery callback without undoing the repaired DOM', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const failure = new Error('recovery callback failed');
		const onRecoverableError = vi.fn(() => {
			throw failure;
		});
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
		expect(errSpy.mock.calls.some((call) => call[0] === failure)).toBe(true);
		expect(container.querySelector('b.inner')).not.toBeNull();
	});

	it('control: a MATCHED hydration never fires the callback', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliDev.Swap, { host: true }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(onRecoverableError).not.toHaveBeenCalled();
	});

	it('control: mismatch recovery without the option keeps current behavior', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		hydrateRoot(container, cliDev.Swap, { host: false });
		flushSync(() => {});
		expect(container.querySelector('b.inner')).not.toBeNull();
		const warns = errSpy.mock.calls.map((c) => String(c[0]));
		expect(warns.some((m) => m.includes('hydration mismatch'))).toBe(true);
	});
});
