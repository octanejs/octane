export type Observation = {
	at: number;
	event: string;
	region?: string;
	revision?: number;
	generation?: number;
};

const observations: Observation[] = [];
let stopCapture: (() => void) | undefined;
let truncated = false;

function record(event: Observation) {
	if (observations.length >= 2_048) {
		truncated = true;
		return;
	}
	observations.push(event);
}

export function installCapture() {
	if (stopCapture !== undefined) return;
	const params = new URL(location.href).searchParams;
	if (params.get('observe') === '0') return;
	const seen = new Map<string, string>();
	const inspect = () => {
		for (const [region, selector] of [
			['shell', '[data-lab-shell]'],
			['answer', '[data-answer]'],
			['history', '[data-history]'],
			['tools', '[data-tools]'],
		] as const) {
			const element = document.querySelector(selector);
			if (element === null) continue;
			const revision = element.getAttribute('data-revision');
			const generation = element.getAttribute('data-generation');
			const identity = `${element.getAttribute('data-conversation-id') ?? ''}:${generation ?? ''}:${revision ?? ''}`;
			if (seen.get(region) === identity) continue;
			seen.set(region, identity);
			record({
				at: performance.now(),
				event: 'dom-observed',
				region,
				...(revision === null ? {} : { revision: Number(revision) }),
				...(generation === null ? {} : { generation: Number(generation) }),
			});
		}
	};
	const observer = new MutationObserver(inspect);
	observer.observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['data-revision', 'data-conversation-id', 'data-generation'],
	});
	const input = (event: Event) => {
		if (event.target instanceof HTMLTextAreaElement && event.target.name === 'draft') {
			record({ at: performance.now(), event: event.isTrusted ? 'native-input' : 'replayed-input' });
		}
	};
	document.addEventListener('input', input, true);
	record({ at: performance.now(), event: 'observer-installed' });
	inspect();
	stopCapture = () => {
		observer.disconnect();
		document.removeEventListener('input', input, true);
		stopCapture = undefined;
	};
}

export function captureSnapshot() {
	return { enabled: stopCapture !== undefined, truncated, observations: [...observations] };
}

export function recordActivation(region: string) {
	if (stopCapture !== undefined) record({ at: performance.now(), event: 'activated', region });
}

export function disposeCapture() {
	stopCapture?.();
}

export async function exportCapture(run: string) {
	const response = await fetch(`/__lab/trace?run=${encodeURIComponent(run)}`);
	if (!response.ok) throw new Error(`Producer trace returned ${response.status}`);
	const server = await response.json();
	const capture = {
		schemaVersion: 1,
		capturedAt: new Date().toISOString(),
		url: location.href,
		clock:
			'Browser observations use navigation-relative performance.now(); server events use their own run-relative monotonic clock.',
		limits:
			'DOM observation is not paint or INP. Instrumentation overhead is included. Resource transfer sizes follow browser cache and timing visibility rules.',
		browser: captureSnapshot(),
		navigation: performance.getEntriesByType('navigation').map((entry) => entry.toJSON()),
		resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()),
		server,
	};
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' }),
	);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `signal-chat-${run}.json`;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
