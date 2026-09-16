import { useLayoutEffect, useRef, useState } from 'octane';
import { currentSignalOwner } from 'octane/signals';
import type { HistoryController } from './controller.ts';
import { draftA$, draftB$, selected$, status$ } from './State.tsrx';

export function HistoryApp() @{
	const host = useRef<HTMLElement | null>(null);
	const controller = useRef<HistoryController | null>(null);
	const [ready, setReady] = useState(false);
	const currentOwner = currentSignalOwner()!;
	const documentOwner =
		'documentOwner' in currentOwner ? currentOwner.documentOwner : currentOwner;
	const draft =
		selected$.get() === 'A' ? draftA$ : draftB$;
	useLayoutEffect(() => {
		let disposed = false;
		if (!import.meta.env.SSR) {
			void import('./controller.ts').then(({ mountHistoryController }) => {
				if (disposed) return;
				controller.current = mountHistoryController(host.current!, documentOwner);
				setReady(true);
			});
		}
		return () => {
			disposed = true;
			controller.current?.dispose();
			controller.current = null;
		};
	}, []);
	<main>
		<h1>Fetched SSR history</h1>
		<fieldset disabled={!ready}>
			<legend>Conversation selection</legend>
			<button
				type="button"
				onClick={() => {
					void controller.current?.select('A').catch(() => {});
				}}
			>Select A</button>
			<button
				type="button"
				onClick={() => {
					void controller.current?.select('B').catch(() => {});
				}}
			>Select B</button>
			<button
				type="button"
				onClick={() => {
					void controller.current?.activate();
				}}
			>Activate history</button>
			<button
				type="button"
				onClick={() => {
					void controller.current?.older();
				}}
			>Older page</button>
		</fieldset>
		<p>{'Selected: ' + selected$.get()}</p>
		<p role="status">{status$}</p>
		{/* This empty host has no renderer-owned children. Its controller owns
    the fetched dormant range and explicitly hands it to hydrateRoot. */}
		<section ref={host} aria-label="Fetched history" />
		<label>
			History draft<textarea aria-label="History draft" value={draft} />
		</label>
	</main>
}
