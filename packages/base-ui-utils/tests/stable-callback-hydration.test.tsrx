import { expect, it, vi } from 'vitest';
import { StableCallbackFixture } from './fixtures/stable-callback.tsrx';
import { StableCallbackFixture as ServerFixture } from './fixtures/stable-callback.tsrx?octane-ssr';
import { createRenderer, registerServerComponent } from './support/renderer';

registerServerComponent(StableCallbackFixture, ServerFixture);
it('hydrates a stable callback before descendants use it in an effect', () => {
	const onCall = vi.fn();
	const { hydrate, container } = createRenderer().renderToString(
		<StableCallbackFixture onCall={onCall} />,
	);
	expect(container.textContent).toBe('Ready');
	expect(onCall).not.toHaveBeenCalled();
	hydrate();
	expect(onCall).toHaveBeenCalledOnce();
});
