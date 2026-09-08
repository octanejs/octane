import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerForm } from '../_fixtures/server.tsrx';

describe('@octanejs/formisch SSR', () => {
	it('isolates sequential server form snapshots without a DOM', () => {
		expect(typeof document).toBe('undefined');

		const first = renderToStaticMarkup(ServerForm, { initial: 'Ada' });
		const second = renderToStaticMarkup(ServerForm, { initial: 'Grace' });

		expect(first.html).toContain('value="Ada"');
		expect(first.html).toContain('>Ada</output>');
		expect(second.html).toContain('value="Grace"');
		expect(second.html).toContain('>Grace</output>');
		expect(second.html).not.toContain('Ada');
		expect(first.css).toBe('');
		expect(second.css).toBe('');
	});
});
