import { describe, expect, it } from 'vitest';
import { startTransition } from 'octane';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers';
import { ExternalEffectEventUpdates } from './_fixtures/effect-event-actions.tsrx';

describe('Effect Event transition ownership', () => {
	it.each(['normal', 'throw', 'transition'] as const)(
		'keeps %s event updates in their own transition context',
		async (mode) => {
			const scope = createScope({ scopeKey: `effect-event-${mode}` });
			const actionScope = createScope({ scopeKey: `unrelated-action-${mode}` });
			const count$ = scope.signal$('count', 0);
			const held$ = actionScope.signal$('held', 0);
			let release!: () => void;
			const pending = new Promise<void>((resolve) => (release = resolve));
			let event!: (kind: typeof mode) => void;
			const r = mount(ExternalEffectEventUpdates, {
				count$,
				pending,
				bind: (callback) => (event = callback),
			});
			try {
				if (mode !== 'transition') {
					startTransition(async () => {
						held$.set(1);
						await pending;
					});
					await Promise.resolve();
				}
				await act(() => {
					if (mode === 'throw') expect(() => event(mode)).toThrow('event failed');
					else event(mode);
				});
				expect(count$.get()).toBe(mode === 'transition' ? 0 : 1);
				expect(r.find('output').textContent).toBe(mode === 'transition' ? '0:0:0' : '1:1:1');
				if (mode !== 'transition') {
					held$.set(2);
					expect(held$.get()).toBe(0);
					actionScope.dispose();
				}
				await act(() => release());
				expect(count$.get()).toBe(1);
				expect(r.find('output').textContent).toBe('1:1:1');
			} finally {
				release();
				await act(() => {});
				r.unmount();
				actionScope.dispose();
				scope.dispose();
			}
		},
	);
});
