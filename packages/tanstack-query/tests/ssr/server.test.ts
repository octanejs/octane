import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { ServerQuery } from '../_fixtures/server.tsrx';

describe('@octanejs/tanstack-query SSR', () => {
	it('renders initial query data without a DOM', () => {
		expect(typeof document).toBe('undefined');
		expect(renderToStaticMarkup(ServerQuery).html).toBe(
			'<output id="query-result">success:Server Ada</output>',
		);
	});
});
