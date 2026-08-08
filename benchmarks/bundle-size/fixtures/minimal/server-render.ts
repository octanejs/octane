import { renderToString } from 'octane/server';

export function run() {
	const { html, css } = renderToString(() => '<main id="minimal-server">Octane</main>');
	return { html, css };
}
