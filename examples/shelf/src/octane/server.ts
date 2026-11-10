/** @jsxImportSource octane */
import { prerender } from 'octane/static';
import { App } from './App.tsrx';
import type { Session } from '../shared/session.ts';

/** Render the Octane page with every read loaded. */
export async function renderOctane(session: Session): Promise<string> {
	const { html, css } = await prerender(App, { title: 'Shelf — Octane', session });
	return css + html;
}
