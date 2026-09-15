// Public-API setup for an installed-but-idle ViewTransition work comparison.
// Both URL modes load this same module and fixture bundle. Setup is untimed.
import {
	createElement,
	createRoot,
	drainPassiveEffects,
	flushSync,
	startTransition,
	ViewTransition,
} from 'octane';

const mode = new URL(location.href).searchParams.get('vt-primer') ?? 'cold';
const report = {
	mode,
	ready: false,
	nativeCalls: 0,
	updateCallbacks: 0,
	outcomes: [],
	removed: false,
	remainingTransitionAnimations: null,
	error: null,
};
window.__vtIdlePrimer = report;

const check = (condition, message) => {
	if (!condition) throw new Error(`ViewTransition idle primer: ${message}`);
};
const flush = (work) => {
	flushSync(work);
	drainPassiveEffects();
};
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const deadline = (promise, label) => {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`Primer timed out: ${label}`)), 8000);
		}),
	]).finally(() => clearTimeout(timer));
};

export async function prepareIdleTransitionDriver() {
	check(mode === 'cold' || mode === 'idle', `unknown vt-primer mode ${mode}`);
	check(document.visibilityState === 'visible', 'the page must be visible');
	const before = new Set(document.body.childNodes);
	const container = document.createElement('div');
	container.setAttribute('data-vt-idle-primer', '');
	// Visible and in-viewport, so native eligibility cannot skip the real update.
	container.style.cssText =
		'position:fixed;left:0;top:0;width:16px;height:16px;pointer-events:none';
	document.body.appendChild(container);
	let root;
	const originalOwn = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
	const nativeStart = document.startViewTransition;
	let wrapped;
	try {
		check(typeof nativeStart === 'function', 'native document transitions are unavailable');
		let observeStart;
		const started = new Promise((resolve) => {
			observeStart = resolve;
		});
		wrapped = function (...args) {
			const native = Reflect.apply(nativeStart, this, args);
			report.nativeCalls++;
			const done = Promise.allSettled([native.ready, native.updateCallbackDone, native.finished]);
			observeStart(done);
			return native;
		};
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			writable: true,
			value: wrapped,
		});
		root = createRoot(container);
		const content = (value) =>
			createElement(
				'div',
				{
					// Both revisions observe a geometry change. The older descriptor path
					// does not mark same-size text/color writes as a boundary update.
					style: {
						width: value === 'before' ? 16 : 24,
						height: 16,
						backgroundColor: value === 'before' ? 'red' : 'blue',
					},
				},
				value,
			);
		const scene = (value) =>
			mode === 'idle'
				? createElement(
						ViewTransition,
						{
							name: 'octane-idle-primer',
							onUpdate() {
								report.updateCallbacks++;
							},
						},
						content(value),
					)
				: content(value);
		flush(() => root.render(scene('before')));
		check(container.textContent === 'before', 'initial primer output is missing');
		await frame();
		if (mode === 'idle') {
			startTransition(() => root.render(scene('after')));
			// Promise assimilation waits for all three actual native promises.
			const outcomes = await deadline(started, 'native transition completion');
			report.outcomes = outcomes.map((result) => result.status);
			check(report.nativeCalls === 1, `expected one native call, saw ${report.nativeCalls}`);
			check(
				report.outcomes.every((status) => status === 'fulfilled'),
				`native transition did not complete successfully: ${report.outcomes}`,
			);
			check(report.updateCallbacks === 1, 'public update callback did not run exactly once');
		} else {
			flush(() => root.render(scene('after')));
			check(report.nativeCalls === 0, 'cold setup unexpectedly started a transition');
		}
		check(container.textContent === 'after', 'updated primer output is missing');
		flush(() => root.unmount());
		root = null;
		check(container.childNodes.length === 0, 'primer root retained content');
		container.remove();
		// Allow native completion continuations and scheduled passive tasks to drain.
		await frame();
		await frame();
		flush(() => {});
		check(
			report.nativeCalls === (mode === 'idle' ? 1 : 0),
			'additional native work started during primer cleanup',
		);
		report.remainingTransitionAnimations = document
			.getAnimations()
			.filter((animation) =>
				String(animation.effect?.pseudoElement ?? '').includes('view-transition'),
			).length;
		check(report.remainingTransitionAnimations === 0, 'native animation remains active');
		check(
			document.body.childNodes.length === before.size &&
				[...document.body.childNodes].every((node) => before.has(node)),
			'primer left document nodes behind',
		);
		report.removed = !container.isConnected;
		report.ready = true;
		return report;
	} catch (error) {
		report.error = error instanceof Error ? error.message : String(error);
		throw error;
	} finally {
		if (root) flush(() => root.unmount());
		container.remove();
		if (wrapped && document.startViewTransition === wrapped) {
			if (originalOwn) Object.defineProperty(document, 'startViewTransition', originalOwn);
			else delete document.startViewTransition;
		}
	}
}
