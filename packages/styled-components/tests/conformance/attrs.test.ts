// .attrs parity: object and function attrs, chain override order, className
// and style merging, attrs-provided `as`, and props-beat-attrs semantics.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled from '@octanejs/styled-components';
import { mount } from '../_helpers';

describe('.attrs', () => {
	it('applies object attrs as DOM props', () => {
		const Input = styled.input.attrs({ type: 'password', 'data-kind': 'secret' })`
			color: indigo;
		`;
		const m = mount(() => createElement(Input as any, { id: 'in' }));
		const el = m.find('#in') as HTMLInputElement;
		expect(el.getAttribute('type')).toBe('password');
		expect(el.getAttribute('data-kind')).toBe('secret');
		m.unmount();
	});

	it('resolves function attrs against props and lets later attrs override earlier ones', () => {
		const Chained = styled.input
			.attrs<{ $size?: string }>(() => ({ tabIndex: 1, 'data-a': 'first' }))
			.attrs((props) => ({ 'data-a': 'second', 'data-size': props.$size ?? 'md' }))`
      color: navy;
    `;
		const m = mount(() => createElement(Chained as any, { id: 'c', $size: 'lg' }));
		const el = m.find('#c');
		expect(el.getAttribute('data-a')).toBe('second');
		expect(el.getAttribute('data-size')).toBe('lg');
		expect(el.getAttribute('tabindex')).toBe('1');
		m.unmount();
	});

	it('applies attrs over same-named props; explicit undefined resets to the prop side (v6)', () => {
		const Sized = styled.input.attrs({ 'data-size': 'attrs' })`
			color: brown;
		`;
		// v6 semantics: the attr value wins over an ordinary prop value…
		const m = mount(() => createElement(Sized as any, { id: 's', 'data-size': 'props' }));
		expect(m.find('#s').getAttribute('data-size')).toBe('attrs');
		m.unmount();

		// …but an explicit `undefined` prop suppresses the attr entirely.
		const m2 = mount(() => createElement(Sized as any, { id: 's2', 'data-size': undefined }));
		expect(m2.find('#s2').hasAttribute('data-size')).toBe(false);
		m2.unmount();
	});

	it('merges attrs className with the generated classes and the user className', () => {
		const Tagged = styled.span.attrs({ className: 'from-attrs' })`
			color: crimson;
		`;
		const m = mount(() => createElement(Tagged as any, { id: 't', className: 'from-props' }));
		const classes = (m.find('#t').getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
		expect(classes).toContain('from-attrs');
		expect(classes).toContain('from-props');
		expect(classes).toContain((Tagged as any).styledComponentId);
		// user className comes last (upstream merge order: folded, generated, user)
		expect(classes.indexOf('from-props')).toBe(classes.length - 1);
		m.unmount();
	});

	it('merges attrs style objects over the props style (v6 merge order)', () => {
		// Per upstream v6 resolveContext, the attr style object is spread over
		// context.style (which starts as props.style), so attr keys win.
		const StyledDiv = styled.div.attrs({ style: { outline: '1px solid red', margin: '1px' } })`
			color: black;
		`;
		const m = mount(() =>
			createElement(StyledDiv as any, { id: 'st', style: { margin: '2px', padding: '3px' } }),
		);
		const el = m.find('#st') as HTMLElement;
		expect(el.style.outline).toBe('1px solid red');
		expect(el.style.margin).toBe('1px');
		expect(el.style.padding).toBe('3px');
		m.unmount();
	});

	it('honors an attrs-provided `as` target', () => {
		const Linkish = styled.div.attrs({ as: 'a', href: '#x' })`
			color: dodgerblue;
		`;
		const m = mount(() => createElement(Linkish as any, { id: 'l' }));
		const el = m.find('#l');
		expect(el.tagName).toBe('A');
		expect(el.getAttribute('href')).toBe('#x');
		m.unmount();
	});
});
