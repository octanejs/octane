import { createRoot } from 'octane';
import { ReactCompat } from 'octane/react';
import { App } from '../octane/App.tsrx';
import { ReactSummary } from '../react/Summary.tsx';
import { startSession } from '../shared/client.ts';
import type { Session } from '../shared/session.ts';
import '../styles.css';

/** Rendered inside the Octane shelf, with the same store. */
function Island(props: { session: Session }) @{
	<ReactCompat>
		<ReactSummary store={props.session.store} />
	</ReactCompat>
}

// This page is rendered in the browser only.
createRoot(document.getElementById('root')!).render(App, {
	title: 'Shelf — Octane with a React island',
	session: startSession().session,
	Island,
});
