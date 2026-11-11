/** @jsxImportSource octane */
import { createElement } from 'octane/server';
import { ReactCompatInline } from 'octane/react/server';
import { prerender } from 'octane/static';
import { createElement as createReactElement } from 'react';
import { CounterApp, ContextApp } from '../../react-compat/fixtures.tsrx';

function InlineLabel() {
	return createReactElement('button', null, 'count:3');
}

function InlineCounterApp() {
	return createElement(
		'p',
		null,
		'Before ',
		createElement(ReactCompatInline, { component: InlineLabel }),
		' after',
	);
}

export async function renderCompiled() {
	const counter = await prerender(
		CounterApp,
		{ label: 'SSR <counter>', start: 7 },
		{ timeoutMs: 5_000 },
	);
	const context = await prerender(ContextApp, { value: 'server theme' }, { timeoutMs: 5_000 });
	const inline = await prerender(InlineCounterApp, {}, { timeoutMs: 5_000 });
	return { counter: counter.html, context: context.html, inline: inline.html };
}
