import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { BoundaryClient } from './_fixtures/range-boundary.tsrx';

const fixture = join(import.meta.dirname, '_fixtures/range-boundary.tsrx');
const server = loadServerFixture(fixture);

let container: HTMLDivElement;
let portalTarget: HTMLDivElement;
beforeEach(() => {
	container = document.createElement('div');
	portalTarget = document.createElement('div');
	document.body.append(container, portalTarget);
});
afterEach(() => {
	container.remove();
	portalTarget.remove();
});

describe('hydration range boundary', () => {
	it('retains wrappers and portals outside the selected server range', () => {
		container.innerHTML = ServerRuntime.renderToString(server.ServerSelection).html;
		const button = container.querySelector('#range-boundary-counter') as HTMLButtonElement;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(container, BoundaryClient, {
				enabled: true,
				portalTarget,
			});
			flushSync(() => {});
			expect(error).not.toHaveBeenCalled();
			expect(container.querySelector('#range-boundary-counter')).toBe(button);
			expect(portalTarget.querySelectorAll('#range-boundary-portal')).toHaveLength(1);
			flushSync(() => button.click());
			expect(button.textContent?.trim()).toBe('count 1');
			root.unmount();
			expect(container.querySelector('#range-boundary-counter')).toBeNull();
			expect(portalTarget.querySelector('#range-boundary-portal')).toBeNull();
		} finally {
			error.mockRestore();
		}
	});
});
