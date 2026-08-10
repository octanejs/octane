import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { VisibilityProbe } from './_fixtures/visibility-probe.tsrx';

describe('@octanejs/sonner — server rendering', function () {
	it('guards document.hidden when toast visibility state initializes on the server', function () {
		const { html } = renderToString(VisibilityProbe);
		expect(html).toContain('data-document-hidden="false"');
		expect(html).toContain('visibility probe');
	});
});
