import { describe, it, expect } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

for (const strong of [false, true]) {
	const { Buttons } = loadCompiledFixtureSource(
		`${strong ? "'use strong';" : ''}
 export function Buttons({invoke,value,other}) @{
  <section>
   <button data-kind="one" onClick={()=>invoke(value)}>one</button>
   <button data-kind="two" onClick={()=>invoke(value,other)}>two</button>
   <button data-kind="many" onClick={()=>invoke(value,other,'last')}>many</button>
   <button data-kind="event" onClick={(event)=>{invoke(event.type,value);}}>event</button>
  </section>
 }`,
		{
			id: `event-bundle-captures-${strong}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		},
	);
	describe(`native bundle captures (strong=${strong})`, () => {
		it('keeps signed zero, NaN, and changed callbacks observable across repeated updates', () => {
			const host = document.createElement('div');
			document.body.append(host);
			const root = createRoot(host);
			const seen: { callback: string; values: unknown[] }[] = [];
			const invoke = (...values: unknown[]) => seen.push({ callback: 'original', values });
			try {
				root.render(Buttons, { invoke, value: 0, other: 'other' });
				const buttons = Array.from(host.querySelectorAll('button'));
				for (const value of [-0, NaN, NaN, 0]) {
					flushSync(() => root.render(Buttons, { invoke, value, other: 'other' }));
					buttons.forEach((button) => button.click());
					expect(seen.splice(0)).toEqual([
						{ callback: 'original', values: [value] },
						{ callback: 'original', values: [value, 'other'] },
						{ callback: 'original', values: [value, 'other', 'last'] },
						{ callback: 'original', values: ['click', value] },
					]);
					Array.from(host.querySelectorAll('button')).forEach((button, index) =>
						expect(button).toBe(buttons[index]),
					);
				}
				flushSync(() =>
					root.render(Buttons, {
						invoke: (...values: unknown[]) => seen.push({ callback: 'new', values }),
						value: 0,
						other: 'other',
					}),
				);
				buttons[0].click();
				expect(seen).toEqual([{ callback: 'new', values: [0] }]);
			} finally {
				root.unmount();
				expect(host.childNodes.length).toBe(0);
				host.remove();
			}
		});
	});
}

// A child that updates its parent while rendering re-renders the parent inside
// the same root render. That pass resumes the cells the first one staged and
// records every bundle again: one that changes only in the second pass, one it
// changes back, and one that never changes all dispatch what it rendered.
const { Replayed } = loadCompiledFixtureSource(
	`import { useState } from 'octane';
 function Sync({value,onValue}) @{
  onValue(value);
  <i>{value as string}</i>
 }
 export function Replayed({invoke,value,label}) @{
  const [shown, setShown] = useState(value);
  <section>
   <output>{value as string}</output>
   <button data-kind="shown" onClick={()=>invoke(shown)}>shown</button>
   <button data-kind="pending" onClick={()=>invoke(shown === value ? 'settled' : value)}>pending</button>
   <button data-kind="label" onClick={()=>invoke(label)}>label</button>
   <Sync value={value} onValue={setShown} />
  </section>
 }`,
	{
		id: 'event-bundle-replayed.tsrx',
		mode: 'client',
		compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
	},
);

describe('native bundle captures across a resumed render', () => {
	it('dispatches the captures the last pass rendered', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const root = createRoot(host);
		const seen: unknown[] = [];
		const invoke = (value: unknown) => seen.push(value);
		try {
			root.render(Replayed, { invoke, value: 'a', label: 'fixed' });
			const click = () => {
				for (const button of host.querySelectorAll('button')) button.click();
				return seen.splice(0);
			};
			expect(click()).toEqual(['a', 'settled', 'fixed']);
			for (const value of ['b', 'c']) {
				flushSync(() => root.render(Replayed, { invoke, value, label: 'fixed' }));
				expect(host.querySelector('output')!.textContent).toBe(value);
				expect(click()).toEqual([value, 'settled', 'fixed']);
			}
		} finally {
			root.unmount();
			host.remove();
		}
	});
});
