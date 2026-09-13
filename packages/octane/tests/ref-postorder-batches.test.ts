import { expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { RefPostorderBatch } from './_fixtures/ref-postorder-batches.tsrx';

it('attaches child refs before parent refs while preserving sibling branch order', async () => {
	const log: string[] = [];
	const props = { log: (entry: string) => log.push(entry), label: 'initial' };
	const r = mount(RefPostorderBatch, props);
	try {
		await act(() => {});
		expect(r.html()).toBe(
			'<main><section><span>first initial</span><span>second initial</span></section><aside><span>deep initial</span></aside></main>',
		);
		expect(log).toEqual([
			'first initial',
			'second initial',
			'first parent',
			'deep initial',
			'second parent',
		]);
		const first = r.find('section span');
		log.length = 0;
		r.update(RefPostorderBatch, { ...props, label: 'updated' });
		await act(() => {});
		expect(r.find('section span')).toBe(first);
		expect(r.html()).toBe(
			'<main><section><span>first updated</span><span>second updated</span></section><aside><span>deep updated</span></aside></main>',
		);
		expect(log).toEqual([
			'first updated',
			'second updated',
			'first parent',
			'deep updated',
			'second parent',
		]);
	} finally {
		r.unmount();
	}
});
