import { describe, it, expect } from 'vitest';
import { useState } from 'octane';
import { mount, act } from './_helpers';

// Controlled checkables driven by NATIVE input/change handlers (octane has no
// synthetic onChange). The platform toggles a checkable BEFORE its click
// dispatch and fires `input`/`change` AFTER it — so the controlled-state
// restore must NOT run at the end of the click flush (it would revert the
// toggle before the handlers ever see it; React avoids this only because its
// synthetic onChange runs during the click). Regression: with `click` arming
// the restore, `onInput` read a stale reverted `checked` and every controlled
// checkbox was un-toggleable. Surfaced by the react-hook-form port.

function ControlledCheckbox() @{
	const [on, setOn] = useState(false);
	<label>
		<input
			type="checkbox"
			checked={on}
			onInput={(e) => setOn((e.target as HTMLInputElement).checked)}
		/>
		<span>
			{on ? 'on' : 'off'}
		</span>
	</label>
}

function RejectingCheckbox() @{
	const [on] = useState(false);
	<input type="checkbox" checked={on} onInput={() => {}} />
}

function ControlledCheckboxChange() @{
	const [on, setOn] = useState(false);
	<label>
		<input
			type="checkbox"
			checked={on}
			onChange={(event) => setOn((event.target as HTMLInputElement).checked)}
		/>
		<span>
			{on ? 'on' : 'off'}
		</span>
	</label>
}

function ControlledRadios() @{
	const [pick, setPick] = useState('a');
	<div>
		<input
			id="ra"
			type="radio"
			name="r"
			value="a"
			checked={pick === 'a'}
			onInput={(e) => setPick((e.target as HTMLInputElement).value)}
		/>
		<input
			id="rb"
			type="radio"
			name="r"
			value="b"
			checked={pick === 'b'}
			onInput={(e) => setPick((e.target as HTMLInputElement).value)}
		/>
		<p>{pick}</p>
	</div>
}

function ControlledRadiosChange(props) @{
	const [pick, setPick] = useState('a');
	<form>
		<input
			id="rca"
			type="radio"
			name="rc"
			value="a"
			checked={pick === 'a'}
			onChange={(event) => {
				props.log.push([
					'a',
					(event.currentTarget.form.elements.namedItem('rc')[0] as HTMLInputElement).checked,
					(event.currentTarget.form.elements.namedItem('rc')[1] as HTMLInputElement).checked,
				]);
				if (props.accept) setPick('a');
			}}
		/>
		<input
			id="rcb"
			type="radio"
			name="rc"
			value="b"
			checked={pick === 'b'}
			onChange={(event) => {
				props.log.push([
					'b',
					(event.currentTarget.form.elements.namedItem('rc')[0] as HTMLInputElement).checked,
					(event.currentTarget.form.elements.namedItem('rc')[1] as HTMLInputElement).checked,
				]);
				if (props.accept) setPick('b');
			}}
		/>
		<output>{pick as string}</output>
	</form>
}

describe('controlled checkables with native input/change handlers', () => {
	it('click toggles a controlled checkbox through onInput (fresh checked)', async () => {
		const r = mount(ControlledCheckbox);
		const box = r.find('input') as HTMLInputElement;
		expect(box.checked).toBe(false);
		await act(() => {
			box.click();
		});
		expect(box.checked).toBe(true);
		expect(r.container.textContent).toBe('on');
		await act(() => {
			box.click();
		});
		expect(box.checked).toBe(false);
		expect(r.container.textContent).toBe('off');
		r.unmount();
	});

	it('a rejected toggle snaps back after the input/change dispatch', async () => {
		const r = mount(RejectingCheckbox);
		const box = r.find('input') as HTMLInputElement;
		await act(() => {
			box.click();
		});
		// handler committed nothing → the controlled value re-asserts
		expect(box.checked).toBe(false);
		r.unmount();
	});

	it('controlled radio group moves selection through onInput', async () => {
		const r = mount(ControlledRadios);
		const rb = r.find('#rb') as HTMLInputElement;
		await act(() => {
			rb.click();
		});
		expect((r.find('#rb') as HTMLInputElement).checked).toBe(true);
		expect((r.find('#ra') as HTMLInputElement).checked).toBe(false);
		expect(r.find('p').textContent).toBe('b');
		r.unmount();
	});

	it('native change can accept a controlled checkbox activation', async () => {
		const r = mount(ControlledCheckboxChange);
		const box = r.find('input') as HTMLInputElement;
		await act(() => box.click());
		expect(box.checked).toBe(true);
		expect(r.container.textContent).toBe('on');
		r.unmount();
	});

	it('native change observes fresh radio cousins before accepting or rejecting', async () => {
		for (const accept of [true, false]) {
			const log: Array<[string, boolean, boolean]> = [];
			const r = mount(ControlledRadiosChange, { accept, log });
			const a = r.find('#rca') as HTMLInputElement;
			const b = r.find('#rcb') as HTMLInputElement;
			await act(() => b.click());
			expect(log).toEqual([['b', false, true]]);
			expect([a.checked, b.checked]).toEqual(accept ? [false, true] : [true, false]);
			r.unmount();
		}
	});
});
