import type { ComponentBody } from 'octane';
import { prerender } from 'octane/static';
import { describe, expect, it } from 'vitest';
import { AsyncConsumer, HooksConsumer, SyncConsumer } from './consumer.tsrx';

describe('mapped-equivalent public consumer', () => {
	it('executes the synchronous consumer through the public package entry point', async () => {
		const result = await prerender(SyncConsumer as ComponentBody, {});
		expect(result.html).toContain('<h1>Hello</h1>');
	});

	it('executes the awaited consumer through the public package entry point', async () => {
		const result = await prerender(AsyncConsumer as ComponentBody, {});
		expect(result.html).toContain('<h1>Awaited</h1>');
	});

	it('preserves the hooks fallback during server rendering', async () => {
		const result = await prerender(HooksConsumer as ComponentBody, {});
		expect(result.html).toContain('<span>Loading</span>');
	});
});
