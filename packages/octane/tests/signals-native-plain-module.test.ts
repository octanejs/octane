import { afterAll, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, useMemo } from 'octane';
import { createScope } from 'octane/signals';

// This file deliberately imports no fully compiled JSX component. A plain
// renderer module must activate collection before its first authored render.
const scope = createScope({ scopeKey: 'native-plain-module' });
const count$ = scope.signal$('count', 1);
const body$ = scope.signal$('body', 10);

function Reader({ value = count$.get() }: { value?: number }) {
	const body = useMemo(() => body$.get());
	return createElement('p', null, value + ':' + body);
}

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
afterAll(() => {
	root.unmount();
	container.remove();
	try {
		expect(scope.inspect().nodes.every((node) => node.subscribers === 0)).toBe(true);
	} finally {
		scope.dispose();
	}
});
root.render(Reader, {});

describe('native reads in an application made only of plain modules', () => {
	it('collects first-render parameter defaults and inferred memo reads', () => {
		const host = container.querySelector('p')!;
		expect(host.textContent).toBe('1:10');
		flushSync(() => count$.set(2));
		expect(container.querySelector('p')).toBe(host);
		expect(host.textContent).toBe('2:10');
		flushSync(() => body$.set(11));
		expect(host.textContent).toBe('2:11');
	});
});
