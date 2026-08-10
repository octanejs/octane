import loader from '@monaco-editor/loader';
import { flushSync } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects, mount } from '../../octane/tests/_helpers';
import { createFakeMonaco } from './_fake-monaco';
import { UseMonacoProbe } from './_fixtures/use-monaco.tsrx';

const harness = createFakeMonaco();

beforeAll(() => {
	loader.config({ monaco: harness.monaco });
});

describe('@octanejs/monaco-editor useMonaco', () => {
	it('publishes the configured Monaco instance', async () => {
		const onMonaco = vi.fn();
		const result = mount(UseMonacoProbe, { onMonaco });
		flushEffects();
		await Promise.resolve();
		await Promise.resolve();
		flushEffects();
		flushSync(() => {});

		expect(onMonaco).toHaveBeenLastCalledWith(harness.monaco);
		expect(result.find('[data-ready]').getAttribute('data-ready')).toBe('true');
		result.unmount();
	});
});
