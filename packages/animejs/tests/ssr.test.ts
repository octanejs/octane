import { describe, expect, it } from 'vitest';
import type { UseAnimeScopeResult } from '@octanejs/animejs';
import { renderToString } from 'octane/server';
import { SsrScopeProbe } from './_fixtures/scope.tsrx';

describe('server rendering', () => {
	it('renders without creating a scope or reading the DOM', () => {
		let result: UseAnimeScopeResult | undefined;
		const { html } = renderToString(SsrScopeProbe, {
			capture(next: UseAnimeScopeResult) {
				result = next;
			},
		});

		expect(html).toContain('<div>server</div>');
		expect(result?.root.current).toBeNull();
		expect(result?.scope.current).toBeNull();
	});
});
