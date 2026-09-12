import { expect, it } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr.js';
import { HydratableChat } from '../_fixtures/ui-lifecycle.tsrx';
import type { UIMessage } from '@tanstack/ai-client';

// @parity-case conformance:ai-ui-hydration
it('adopts server-rendered chat widgets and replaces their thread without replacing surviving DOM', async () => {
	const messages = (text: string): UIMessage[] => [
		{ id: 'one', role: 'assistant', parts: [{ type: 'text', content: text }] },
	];
	const props = { threadId: 'server', initialMessages: messages('Server transcript') };
	const { html } = await renderHydrationFixture(
		'tanstack-ai',
		'packages/tanstack-ai/tests/_fixtures/ui-lifecycle.tsrx',
		'HydratableChat',
		props,
	);
	const container = document.createElement('main');
	container.innerHTML = html;
	document.body.append(container);
	const output = container.querySelector('article')!;
	expect(output.textContent).toBe('Server transcript');
	const root = hydrateRoot(container, HydratableChat, props);
	try {
		await act(async () => {});
		expect(container.querySelector('article')).toBe(output);
		await act(async () =>
			root.render(HydratableChat, {
				threadId: 'client',
				initialMessages: messages('Client transcript'),
			}),
		);
		expect(container.querySelector('article')).toBe(output);
		expect(output.textContent).toBe('Client transcript');
	} finally {
		root.unmount();
		container.remove();
	}
	expect(output.isConnected).toBe(false);
});
