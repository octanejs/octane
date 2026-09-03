import { createElement, renderToString } from 'octane/server';

export function run() {
	const { html, css } = renderToString(() =>
		createElement('main', { id: 'minimal-server' }, 'Octane'),
	);
	return { html, css };
}
