import { activate } from './adapter.tsrx';
import { start } from './host.ts';
import { eligible } from './preflight.ts';
import { transfer } from './transfer.ts';

await start(async (slot, source, signal) => {
	const root = eligible(slot);
	// Select a fallback before any binding claim. The preflight does not prove
	// ownership, source behavior, or future lifetime; those remain host contracts.
	if (window.__automaticPreferRenderer || !root) {
		document.documentElement.dataset.automaticMode = 'renderer';
		const renderer = await import('./renderer.ts');
		if (signal.aborted) {
			document.documentElement.dataset.automaticAborted = 'true';
			return null;
		}
		return renderer.activate(slot, source, signal);
	}
	const transferred = transfer(slot);
	if (!transferred) throw new Error('Binding range changed during preflight');
	document.documentElement.dataset.automaticMode = 'bindings';
	return activate(transferred, source, signal);
});
