export const INITIAL_VALUE = '';
export const PRE_HYDRATION_TEXT = 'typed before hydration';
export const POST_HYDRATION_TEXT = ' and still responsive';
export const CARD_COUNT = 180;

export function readHydrationDraft() {
	if (typeof document === 'undefined') return INITIAL_VALUE;
	return document.querySelector('#hydration-input')?.value ?? INITIAL_VALUE;
}

export const CARDS = Array.from({ length: CARD_COUNT }, (_, index) => ({
	id: index + 1,
	title: `Server-rendered article ${index + 1}`,
	description: `Hydration should adopt article ${index + 1} without replacing its DOM.`,
}));

export function startHydrationBootstrap(loadClient, initializeCapture) {
	initializeCapture?.();

	const status = {
		bootstrapAt: performance.now(),
		clientRequestedAt: 0,
		clientLoadedAt: 0,
		hydrationStartedAt: 0,
		hydratedAt: 0,
		hydrationCalls: 0,
		replayRootInitializedAt: 0,
		inputAttemptAt: 0,
		firstNativeInputAt: 0,
		nativeInputCount: 0,
		originalInput: null,
		originalCard: null,
		originalAction: null,
		error: '',
	};

	window.__hydrationInteractivity = status;
	document.addEventListener(
		'input',
		(event) => {
			if (event.target instanceof HTMLInputElement && event.target.id === 'hydration-input') {
				status.firstNativeInputAt ||= performance.now();
				status.nativeInputCount++;
			}
		},
		true,
	);

	status.clientRequestedAt = performance.now();
	void loadClient()
		.then((client) => {
			status.clientLoadedAt = performance.now();
			client.hydrateBenchmark();
		})
		.catch((error) => {
			status.error = error instanceof Error ? error.message : String(error);
			console.error('Hydration interactivity client failed:', error);
		});
}

export function completeHydration(hydrate) {
	const status = window.__hydrationInteractivity;
	if (!status) throw new Error('Hydration benchmark bootstrap did not run');
	if (status.hydrationCalls !== 0) throw new Error('Hydration was started more than once');

	status.hydrationStartedAt = performance.now();
	const root = hydrate();
	status.hydrationCalls++;
	status.hydratedAt = performance.now();
	return root;
}

export function hydrationProps() {
	const search = new URLSearchParams(window.location.search);
	return {
		controlled: search.get('controlled') === '1',
		deferred: search.get('mode') === 'interaction',
	};
}
