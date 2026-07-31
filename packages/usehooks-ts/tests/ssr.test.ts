import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { SsrProbe } from './_fixtures/hooks.tsrx';

describe('server rendering', () => {
	it('does not run effects, timers, or browser reads while rendering', () => {
		expect(renderToString(SsrProbe).html).toContain('<p>server</p>');
	});
});
