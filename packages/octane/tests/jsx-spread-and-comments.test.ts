import { it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	SpreadProp as TsxSpreadProp,
	SpreadLocal as TsxSpreadLocal,
	CommentMixed as TsxCommentMixed,
	CommentOnly as TsxCommentOnly,
} from './_fixtures/jsx-spread-comments.tsx';
import {
	SpreadProp as TsrxSpreadProp,
	SpreadLocal as TsrxSpreadLocal,
	CommentMixed as TsrxCommentMixed,
	CommentOnly as TsrxCommentOnly,
} from './_fixtures/jsx-spread-comments.tsrx';

// Two React-JSX (.tsx) backwards-compat compiler fixes, with .tsrx regression guards:
//   1. A prop/local referenced ONLY inside a spread (`{...expr}`) must be forwarded
//      into the lowered fragment (it was previously dropped, so the spread applied
//      nothing — or ReferenceError'd for a local).
//   2. A JSX comment child (`{/* … */}`) must compile to NOTHING (it previously
//      became an empty interpolation hole → build error).
for (const [name, SpreadProp, SpreadLocal, CommentMixed, CommentOnly] of [
	['.tsx', TsxSpreadProp, TsxSpreadLocal, TsxCommentMixed, TsxCommentOnly],
	['.tsrx', TsrxSpreadProp, TsrxSpreadLocal, TsrxCommentMixed, TsrxCommentOnly],
] as const) {
	it(`spreads a prop referenced only in the spread (${name})`, () => {
		const r = mount(SpreadProp as any, {
			attrs: { title: 't', 'data-x': 'y' },
			label: 'hi',
		});
		const el = r.find('[data-testid="sp"]') as HTMLElement;
		expect(el.getAttribute('title')).toBe('t');
		expect(el.getAttribute('data-x')).toBe('y');
		expect(el.textContent).toBe('hi');
		r.unmount();
	});

	it(`spreads a local const referenced only in the spread (${name})`, () => {
		const r = mount(SpreadLocal as any, undefined);
		const el = r.find('[data-testid="sl"]') as HTMLElement;
		expect(el.getAttribute('data-z')).toBe('z');
		r.unmount();
	});

	it(`drops a JSX comment child mixed with a real child (${name})`, () => {
		const r = mount(CommentMixed as any, undefined);
		const el = r.find('[data-testid="cm"]') as HTMLElement;
		const span = el.querySelector('span.y');
		expect(span?.textContent).toBe('hi');
		expect(el.textContent).toBe('hi');
		r.unmount();
	});

	it(`drops a comment-only child (renders nothing) (${name})`, () => {
		const r = mount(CommentOnly as any, undefined);
		const el = r.find('[data-testid="co"]') as HTMLElement;
		expect(el.textContent).toBe('');
		expect(el.children.length).toBe(0);
		r.unmount();
	});
}
