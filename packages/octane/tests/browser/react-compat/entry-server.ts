/** @jsxImportSource octane */
import { prerender } from 'octane/static';
import { CounterApp, ContextApp } from '../../react-compat/fixtures.tsrx';

export async function renderCompiled() {
	const counter = await prerender(
		CounterApp,
		{ label: 'SSR <counter>', start: 7 },
		{ timeoutMs: 5_000 },
	);
	const context = await prerender(ContextApp, { value: 'server theme' }, { timeoutMs: 5_000 });
	return { counter: counter.html, context: context.html };
}
