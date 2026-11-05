// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { collectDiagnostics } from 'octane/compiler';
import { flushEffects, mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { strengthen } from '../dist/strong.js';
import { transformModule } from '../dist/transform.js';

it.each([
	['[]', true, 1],
	['[receive]', false, 2],
])('preserves an effect event subscription with dependencies %s', (deps, strong, subscriptions) => {
	const source = `import { useEffectEvent, useLayoutEffect, useState } from 'react';
import { subscribe, report } from './feed.js';
export function Meter() {
  const [label, setLabel] = useState('first');
  const receive = useEffectEvent(() => report(label));
  useLayoutEffect(() => subscribe(receive), ${deps});
  return <button onClick={() => setLabel('second')}>{label}</button>;
}`;
	const requested = transformModule(source, 'meter.tsx', { strong: true });
	const id = 'meter.tsrx';
	const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, requested.code, id);
	const events = new EventTarget();
	const report = vi.fn();
	const attach = vi.spyOn(events, 'addEventListener');
	const detach = vi.spyOn(events, 'removeEventListener');
	const feed = {
		report,
		subscribe(listener) {
			events.addEventListener('sample', listener);
			return () => events.removeEventListener('sample', listener);
		},
	};
	const { Meter } = loadCompiledFixtureSource(result.code, {
		id,
		mode: 'client',
		runtimeModules: { './feed.js': feed },
	});
	const view = mount(Meter);
	try {
		const button = view.find('button');
		events.dispatchEvent(new Event('sample'));
		flushSync(() => button.click());
		expect(view.find('button')).toBe(button);
		events.dispatchEvent(new Event('sample'));
		expect(report.mock.calls).toEqual([['first'], ['second']]);
		expect(attach).toHaveBeenCalledTimes(subscriptions);
		expect(detach).toHaveBeenCalledTimes(subscriptions - 1);
		expect(result.strong).toBe(strong);
	} finally {
		view.unmount();
	}
	expect(detach).toHaveBeenCalledTimes(subscriptions);
	events.dispatchEvent(new Event('sample'));
	expect(report).toHaveBeenCalledTimes(2);
});

it.each(['', ', undefined'])(
	'preserves an every-commit React effect with dependencies %j',
	(deps) => {
		const source = `import { useEffect } from 'react';
export function Meter({ subscribe, label }) {
  useEffect(() => subscribe()${deps});
  return <p>{label}</p>;
}`;
		const id = 'meter.tsrx';
		const { code } = transformModule(source, 'meter.tsx', { strong: true });
		const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, code, id);
		expect(result.strong).toBe(false);
		const { Meter } = loadCompiledFixtureSource(result.code, { id, mode: 'client' });
		const unsubscribe = vi.fn();
		const subscribe = vi.fn(() => unsubscribe);
		const view = mount(Meter, { subscribe, label: 'first' });
		try {
			flushEffects();
			view.update(Meter, { subscribe, label: 'second' });
			flushEffects();
			expect(view.find('p').textContent).toBe('second');
			expect(subscribe).toHaveBeenCalledTimes(2);
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		} finally {
			view.unmount();
		}
		expect(unsubscribe).toHaveBeenCalledTimes(2);
	},
);
