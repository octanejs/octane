# Shared example E2E utilities

These dependency-free helpers keep the example suites consistent without making
`examples/_shared` a pnpm package. Each application owns its Playwright version
and imports these TypeScript modules by relative path.

## Browser diagnostics

Install the collector before navigation and keep it attached for the whole user
journey. Wait for a user-visible ready state before checking it; two animation
frames are only a paint-turn settle, not an Octane hydration signal.

```ts
import { test, expect } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
} from '../../_shared/e2e/browser.ts';

test('the server page hydrates and handles input', async ({ page }) => {
	const diagnostics = collectBrowserDiagnostics(page, {
		failOnHydrationWarnings: true,
	});
	try {
		await page.goto('/');
		await expect(page.getByRole('main')).toBeVisible();
		await page.getByRole('button', { name: 'Add' }).click();
		await expect(page.getByRole('status')).toHaveText('Added');
		await settleBrowserFrames(page);
		diagnostics.assertClean('add journey');
	} finally {
		diagnostics.stop();
	}
});
```

Page errors and `console.error` fail by default. The optional hydration gate also
catches public `hydration mismatch` diagnostics if an integration emits them at
another console level. An `ignore` predicate is available for an expected error
that the same test explicitly asserts; broad shared allowlists hide regressions
and should not be added.

## Ports, URLs, and server processes

Use one resolved address for both the app server and Playwright's `baseURL`.
App-specific environment names prevent parallel examples from sharing a port.
Omit `defaultPort` to allocate an available loopback port.

```ts
import { defineConfig } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const address = await resolveExampleServerAddress({
	baseURLEnv: 'CINEBASE_BASE_URL',
	portEnv: 'CINEBASE_PORT',
	persistAllocatedPort: true,
});

export default defineConfig({
	use: { baseURL: address.baseURL },
	webServer: address.external
		? undefined
		: {
				command: `pnpm dev -- --port ${address.port} --strictPort`,
				url: address.baseURL,
				reuseExistingServer: false,
			},
});
```

`persistAllocatedPort` is important for Playwright configuration: Playwright
may evaluate the config again in worker processes. Persisting the first
OS-allocated port makes those workers inherit the address of the server that
the primary process started.

Playwright's `webServer` should own normal Playwright-test servers. Tests driven
from Vitest or another runner can instead use `spawnServerProcess`,
`waitForServer`, and `stopServer`; on POSIX those helpers create and stop a whole
process group so package-manager wrappers do not orphan the actual server. On
Windows, use a command that forwards termination to its server child.

## Observation boundary

Example E2E tests assert what a user or browser can observe: content, navigation,
focus, selection, media state, accessible state, errors, and node identity only
when it preserves user state. They do not assert hydration marker spelling,
generated helper names, hook slots, internal queues, or exact render counts.
