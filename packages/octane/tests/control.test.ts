import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	Toggle,
	SwitchToggle,
	LiteToggle,
	NestedLiteToggle,
	NestedComponentToggle,
	NestedDetail,
	ReplacementDetail,
	IfOnly,
	HookInIf,
	IdInComponent,
	IfTrailingText,
	ForTrailingText,
	WhitespaceInIf,
} from './_fixtures/control.tsrx';

function expectExpandedArmReplacement(body: typeof Toggle) {
	const r = mount(body);
	try {
		const section = r.find('section');
		expect(section.textContent).toBe('expand');
		expect(r.findAll('.detail')).toHaveLength(0);
		expect(r.findAll('.hidden')).toHaveLength(0);

		for (let cycle = 0; cycle < 2; cycle++) {
			const button = r.find('.shown');
			r.click('.shown');
			expect(r.findAll('.detail')).toHaveLength(1);
			expect(section.textContent).toBe('expanddetail');
			expect(r.find('.shown')).toBe(button);

			r.click('.shown');
			expect(r.findAll('.detail')).toHaveLength(0);
			expect(section.textContent).toBe('expand');
			expect(r.find('.shown')).toBe(button);

			r.click('.shown');
			expect(r.findAll('.detail')).toHaveLength(1);
			expect(r.find('.shown')).toBe(button);
			r.click('#swap');
			expect(r.findAll('.shown')).toHaveLength(0);
			expect(r.findAll('.detail')).toHaveLength(0);
			expect(r.findAll('.hidden')).toHaveLength(1);
			expect(section.textContent).toBe('replacement');

			r.click('#swap');
			expect(r.findAll('.shown')).toHaveLength(1);
			expect(r.findAll('.detail')).toHaveLength(1);
			expect(r.findAll('.hidden')).toHaveLength(0);
			expect(section.textContent).toBe('expanddetail');
			r.click('.shown');
			expect(r.findAll('.detail')).toHaveLength(0);
			expect(section.textContent).toBe('expand');
		}
	} finally {
		r.unmount();
	}
}

describe('ifBlock', () => {
	it('swaps then/else branches', () => {
		expectExpandedArmReplacement(Toggle);
	});

	it('swaps branches after initially empty component siblings grow', () => {
		expectExpandedArmReplacement(LiteToggle);
	});

	it('keeps nested component sibling growth inside its host', () => {
		const r = mount(NestedLiteToggle);
		try {
			const nested = r.find('.nested');
			const button = r.find('.shown');
			expect(nested.textContent).toBe('swapexpand');
			expect(r.findAll('.detail')).toHaveLength(0);

			r.click('.shown');
			expect(r.find('.shown')).toBe(button);
			expect(r.findAll('.nested .detail')).toHaveLength(1);
			expect(nested.textContent).toBe('swapexpanddetail');
			r.click('.shown');
			expect(r.find('.shown')).toBe(button);
			expect(r.findAll('.detail')).toHaveLength(0);
			expect(nested.textContent).toBe('swapexpand');
			r.click('.shown');
			expect(r.find('.shown')).toBe(button);
			expect(r.findAll('.nested .detail')).toHaveLength(1);

			r.click('#swap');
			expect(r.findAll('.nested')).toHaveLength(0);
			expect(r.findAll('.detail')).toHaveLength(0);
			expect(r.find('.hidden').textContent).toBe('replacement');
			expect(r.find('section').textContent).toBe('swapreplacement');
			r.click('#swap');
			expect(r.findAll('.hidden')).toHaveLength(0);
			expect(r.findAll('.nested .detail')).toHaveLength(1);
			expect(r.find('.nested').textContent).toBe('swapexpanddetail');
		} finally {
			r.unmount();
		}
	});

	it('keeps component replacements inside their nested host', () => {
		let UnknownComp = NestedDetail;
		const r = mount(NestedComponentToggle, { UnknownComp });
		try {
			const section = r.find('section');
			expect(section.textContent).toBe('');
			expect(r.findAll('.nested .detail')).toHaveLength(2);
			for (let cycle = 0; cycle < 2; cycle++) {
				const nested = r.find('.nested');
				r.click('#expand');
				expect(r.find('.nested')).toBe(nested);
				expect(r.findAll('.nested .detail')).toHaveLength(2);
				expect(nested.textContent).toBe('detaildetail');
				expect(section.textContent).toBe('detaildetail');

				const oldDetails = r.findAll('.nested .detail');
				UnknownComp = UnknownComp === NestedDetail ? ReplacementDetail : NestedDetail;
				r.update(NestedComponentToggle, { UnknownComp });
				expect(r.find('.nested')).toBe(nested);
				expect(r.findAll('.nested .detail')).toHaveLength(2);
				expect(r.findAll('.detail')).toHaveLength(2);
				expect(nested.textContent).toBe('detaildetail');
				for (const oldDetail of oldDetails) {
					expect(oldDetail.isConnected).toBe(false);
				}

				r.click('#swap');
				expect(r.findAll('.nested')).toHaveLength(0);
				expect(r.findAll('.detail')).toHaveLength(0);
				expect(section.textContent).toBe('replacement');
				r.click('#swap');
				expect(r.findAll('.nested .detail')).toHaveLength(2);
				expect(section.textContent).toBe('detaildetail');
				r.click('#expand');
				expect(r.findAll('.nested .detail')).toHaveLength(2);
				expect(section.textContent).toBe('');
			}
		} finally {
			r.unmount();
		}
	});

	it('handles if without else (mount + unmount nothing on false)', () => {
		const r = mount(IfOnly);
		expect(r.findAll('.maybe')).toHaveLength(0);
		r.click('button');
		expect(r.findAll('.maybe')).toHaveLength(1);
		r.click('button');
		expect(r.findAll('.maybe')).toHaveLength(0);
		r.unmount();
	});

	it('hooks inside if-branch reset when branch unmounts (Block boundary)', () => {
		const r = mount(HookInIf);
		expect(r.find('#inner').textContent).toBe('0');
		r.click('#inner');
		r.click('#inner');
		expect(r.find('#inner').textContent).toBe('2');
		r.click('#top'); // hide
		expect(r.findAll('#inner')).toHaveLength(0);
		r.click('#top'); // show again — fresh state
		expect(r.find('#inner').textContent).toBe('0');
		r.unmount();
	});
});

describe('switchBlock', () => {
	it('swaps cases after the active case grows', () => {
		expectExpandedArmReplacement(SwitchToggle);
	});
});

describe('useId', () => {
	it('produces a stable id for the component', () => {
		const r = mount(IdInComponent);
		const id1 = r.find('label').getAttribute('for');
		expect(id1).toMatch(/^:r[a-z0-9]+-in-[a-z0-9]+:$/);
		expect(r.find('label').textContent).toBe(id1!);
		r.unmount();
	});

	it('keeps default ids unique across independent roots', () => {
		const r1 = mount(IdInComponent);
		const r2 = mount(IdInComponent);
		const id1 = r1.find('label').getAttribute('for');
		const id2 = r2.find('label').getAttribute('for');
		expect(id1).toMatch(/^:r[a-z0-9]+-in-0:$/);
		expect(id2).toMatch(/^:r[a-z0-9]+-in-0:$/);
		expect(id1).not.toBe(id2);
		r1.unmount();
		r2.unmount();
	});
});

// Pins for tsrx 0.1.29 parser fixes (regression coverage).
describe('parser fixes (tsrx 0.1.29)', () => {
	it('IfTrailingText: text after @if {} closing brace is rendered', () => {
		const r = mount(IfTrailingText, { show: true });
		const p = r.find('p');
		// span.gated must render; the trailing text " trailing!" must follow.
		expect(p.querySelector('.gated')?.textContent).toBe('yes');
		expect(p.textContent).toContain('trailing!');
		r.unmount();
	});

	it('IfTrailingText: trailing text survives when @if branch is empty', () => {
		const r = mount(IfTrailingText, { show: false });
		expect(r.find('p').textContent).toContain('trailing!');
		expect(r.findAll('.gated')).toHaveLength(0);
		r.unmount();
	});

	it('ForTrailingText: text after @for {} closing brace is rendered', () => {
		const r = mount(ForTrailingText, { items: ['a', 'b'] });
		const p = r.find('p');
		const rows = Array.from(p.querySelectorAll('.row')) as HTMLElement[];
		expect(rows.map((r) => r.textContent)).toEqual(['a', 'b']);
		expect(p.textContent).toContain('tail');
		r.unmount();
	});

	it('WhitespaceInIf: a cast expression stays setup-only and does not leak TS', () => {
		// Loading proves stripTsOnlyWrappers kept the assertion out of emitted JS;
		// the empty output pins the intentional rule that a bare expression in a
		// directive arm is setup, even when it is the arm's only statement.
		const r = mount(WhitespaceInIf, { show: true });
		expect(r.find('p').textContent).toBe('');
		r.unmount();
	});
});
