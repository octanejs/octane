import { createPhase0PAPIAdapter } from './papi.mjs';

if (globalThis.__MAIN_THREAD__) {
	let application;

	globalThis.renderPage = () => {
		if (application) return application;

		const papi = createPhase0PAPIAdapter(globalThis);
		const view = papi.create('view', papi.page);
		const text = papi.create('text', view);
		const value = papi.create('raw-text', text, 'Count: 0');
		papi.setDataset(view, 'testid', 'phase-0-imperative');
		papi.append(text, value);
		papi.append(view, text);
		papi.append(papi.page, view);
		papi.flush();
		application = Object.freeze({ papi, text, value, view });
		return application;
	};

	globalThis.updatePage = () => application;
	globalThis.updateGlobalProps = () => application;
}
