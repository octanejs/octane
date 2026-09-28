import { describe, expect, it } from 'vitest';
import { createScope, type WritableSignal } from 'octane/signals';
import { act, mount } from './_helpers';

// Importing octane/signals compiles this module with native reads, so every
// block body is bracketed by a read scope. Empty arms compile to bodiless
// functions; the reading arm beside them must still subscribe, update, and
// resubscribe after the branch switches away and back.
interface Props {
	on: boolean;
	count$: WritableSignal<number>;
}

function EmptyThen(props: Props) @{
	<section>
		@if (props.on) {
		} @else {
			<b>{String(props.count$.get())}</b>
		}
	</section>
}

function EmptyElse(props: Props) @{
	<section>
		@if (props.on) {
			<b>{String(props.count$.get())}</b>
		} @else {
		}
	</section>
}

describe('native-read modules with empty branch arms', () => {
	it.each([
		{ name: 'empty then', Body: EmptyThen, reading: false },
		{ name: 'empty else', Body: EmptyElse, reading: true },
	])('keeps the reading arm reactive ($name)', async ({ Body, reading }) => {
		const scope = createScope({ scopeKey: 'empty-branch-arms' });
		const count$ = scope.signal$('count', 1);
		const rendered = mount(Body, { on: reading, count$ });
		try {
			expect(rendered.container.textContent).toBe('1');
			await act(() => count$.set(2));
			expect(rendered.container.textContent).toBe('2');

			rendered.update(Body, { on: !reading, count$ });
			expect(rendered.container.querySelector('section')!.textContent).toBe('');
			await act(() => count$.set(3));
			expect(rendered.container.querySelector('section')!.textContent).toBe('');

			rendered.update(Body, { on: reading, count$ });
			expect(rendered.container.textContent).toBe('3');
			await act(() => count$.set(4));
			expect(rendered.container.textContent).toBe('4');
		} finally {
			rendered.unmount();
		}
		expect(scope.inspect().nodes.find((node) => node.key === 'count')?.subscribers).toBe(0);
	});
});
