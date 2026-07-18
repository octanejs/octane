// Polymorphic rendering: the `as` prop retargets the host tag or component,
// `forwardedAs` tunnels through styled(Styled) wrappers, and a state-driven
// `as` swap recreates the element in place while keeping the styling classes.
import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';

import styled from '@octanejs/styled-components';
import { mount } from '../_helpers';
import { AsPolymorph } from '../_fixtures/as-polymorph.tsrx';

describe('as / forwardedAs', () => {
	it('renders the `as` tag with the styled classes', () => {
		const Label = styled.span`
			color: darkorange;
		`;
		const m = mount(() => createElement(Label as any, { id: 'a', as: 'strong' }));
		const el = m.find('#a');
		expect(el.tagName).toBe('STRONG');
		expect(el.getAttribute('class')).toContain((Label as any).styledComponentId);
		m.unmount();
	});

	it('renders an `as` component target and forwards filtered props to it', () => {
		let got: any = null;
		function Target(props: any) {
			got = props;
			return createElement('em', { id: props.id, className: props.className });
		}
		const Styled = styled.div`
			color: purple;
		`;
		const m = mount(() => createElement(Styled as any, { id: 'c', as: Target, 'data-z': '9' }));
		expect(m.find('#c').tagName).toBe('EM');
		expect(got['data-z']).toBe('9');
		expect(got.className).toContain((Styled as any).styledComponentId);
		m.unmount();
	});

	it('tunnels forwardedAs through a composite wrapper to the inner styled component', () => {
		// The documented forwardedAs scenario: styled(Wrapper) where Wrapper is a
		// plain component spreading its props onto a styled component. (styled of
		// styled folds instead, so `as` covers that case directly.)
		const Base = styled.button`
			color: crimson;
		`;
		const Wrapper = (props: any) => createElement(Base as any, props);
		const Outer = styled(Wrapper as any)`
			font-weight: bold;
		`;
		const m = mount(() => createElement(Outer as any, { id: 'f', forwardedAs: 'a' }));
		const el = m.find('#f');
		expect(el.tagName).toBe('A');
		expect(el.getAttribute('class')).toContain((Base as any).styledComponentId);
		expect(el.getAttribute('class')).toContain((Outer as any).styledComponentId);
		m.unmount();
	});

	it('recreates the element in place on a state-driven `as` swap, keeping styles', () => {
		const m = mount(AsPolymorph as any);
		const before = m.find('#poly');
		expect(before.tagName).toBe('BUTTON');
		const beforeClasses = before.getAttribute('class');

		m.click('#swap');

		const after = m.find('#poly');
		expect(after.tagName).toBe('A');
		expect(after.getAttribute('href')).toBe('#dest');
		expect(after.getAttribute('class')).toBe(beforeClasses);
		expect(after.textContent).toContain('Target');
		m.unmount();
	});
});
