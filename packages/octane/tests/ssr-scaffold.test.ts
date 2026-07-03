// Phase 0 SSR scaffold: the packaging + mode plumbing exists (no SSR behavior
// yet). Verifies the new subpath exports resolve and behave as scaffolded.
import { describe, it, expect } from 'vitest';
import {
	BLOCK_OPEN,
	BLOCK_CLOSE,
	HYDRATION_START,
	HYDRATION_END,
	EMPTY_COMMENT,
} from 'octane/constants';
import { renderToString } from 'octane/server';

describe('SSR scaffold (phase 0)', () => {
	it('exposes the hydration marker constants via octane/constants', () => {
		expect(HYDRATION_START).toBe('[');
		expect(HYDRATION_END).toBe(']');
		expect(BLOCK_OPEN).toBe('<!--[-->');
		expect(BLOCK_CLOSE).toBe('<!--]-->');
		expect(EMPTY_COMMENT).toBe('<!---->');
	});

	it('octane/server renderToString() renders a component to { html, css }', () => {
		// renderToString is a single synchronous pass; it returns { html, css }
		// (head folded into html). A plain string-returning component → its string.
		const out = renderToString(((_s: any) => '<p>hi</p>') as any);
		expect(out).toEqual({ html: '<p>hi</p>', css: '' });
	});
});
