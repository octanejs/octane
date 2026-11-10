/** @jsxImportSource react */
import { prerender } from 'react-dom/static';
import { App } from './App.tsx';
import type { Session } from '../shared/session.ts';

/** Render the React page with every read loaded. */
export async function renderReact(session: Session): Promise<string> {
	const { prelude } = await prerender(<App session={session} />);
	return new Response(prelude).text();
}
