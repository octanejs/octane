import { expect, it, vi } from 'vitest';
import { motionValue } from 'motion';
import { mount, nextPaint } from '../_helpers';
import { HostContractBox, LogicalStyleBox, SvgContractBox } from '../_fixtures/host-contracts.tsrx';

it('sets callback and object refs before layout effects, then cleans up each ref', () => {
	const object = { current: null as Element | null };
	const callback = vi.fn();
	const cleanup = vi.fn();
	const returningCleanup = vi.fn((element: Element | null) => (element ? cleanup : undefined));
	const onLayout = vi.fn(() => {
		expect(object.current?.id).toBe('box');
		expect(callback).toHaveBeenLastCalledWith(object.current);
		expect(returningCleanup).toHaveBeenLastCalledWith(object.current);
	});
	const r = mount(HostContractBox, { ref: [object, callback, returningCleanup], onLayout });
	expect(onLayout).toHaveBeenCalledOnce();
	expect(object.current).toBe(r.find('#box'));
	r.unmount();
	expect(object.current).toBeNull();
	expect(callback).toHaveBeenLastCalledWith(null);
	expect(cleanup).toHaveBeenCalledOnce();
});

it('updates native children and events while removing stale styles on the surviving host', async () => {
	const first = vi.fn();
	const replacement = vi.fn();
	const opacity = motionValue(0.5);
	const r = mount(HostContractBox, { style: { position: 'absolute', opacity }, onClick: first });
	try {
		await nextPaint();
		const element = r.find('#box') as HTMLElement;
		expect(element.style.position).toBe('absolute');
		expect(element.style.opacity).toBe('0.5');
		r.click('#box');
		expect(first).toHaveBeenCalledOnce();
		r.update(HostContractBox, { style: {}, onClick: replacement, text: 'updated' });
		await nextPaint();
		expect(r.find('#box')).toBe(element);
		expect(element.textContent).toBe('updated');
		expect(element.style.position).toBe('');
		expect(element.style.opacity).toBe('');
		opacity.set(0.8);
		expect(element.style.opacity).toBe('');
		r.click('#box');
		expect(first).toHaveBeenCalledOnce();
		expect(replacement).toHaveBeenCalledOnce();
	} finally {
		r.unmount();
	}
});

it('renders named SVG hosts with ordinary attributes and an SVG element ref', () => {
	const ref = { current: null as SVGSVGElement | null };
	const r = mount(SvgContractBox, { ref });
	try {
		expect(ref.current).toBe(r.find('#svg'));
		expect(ref.current).toBeInstanceOf(SVGSVGElement);
		expect(ref.current?.getAttribute('viewBox')).toBe('0 0 20 20');
		expect(r.find('rect').getAttribute('x')).toBe('1');
		expect(r.find('rect').getAttribute('y')).toBe('2');
		expect(ref.current?.style.transform).toBe('');
	} finally {
		r.unmount();
	}
	expect(ref.current).toBeNull();
});

it('binds derived numeric values to logical and inset CSS properties', async () => {
	const value = motionValue(5);
	const r = mount(LogicalStyleBox, { value });
	try {
		await nextPaint();
		const element = r.find('#box') as HTMLElement;
		const observed = () => [
			element.style.paddingBlock,
			element.style.marginInline,
			element.style.inset,
			element.style.insetInlineStart,
		];
		expect(observed()).toEqual(['10px', '10px', '10px', '10px']);
		value.set(10);
		await vi.waitFor(() => expect(observed()).toEqual(['20px', '20px', '20px', '20px']));
	} finally {
		r.unmount();
	}
});
