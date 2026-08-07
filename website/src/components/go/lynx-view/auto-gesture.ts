// Driving a Lynx preview with simulated touches, and showing them.
//
// A gesture-driven example is unreadable as a still frame: the Lynx Product
// Detail tutorial is a carousel whose whole point is that the drag, the release
// and the snap all run on the main thread, and a reader looking at an embedded
// preview has no way to know that until they touch it — which, on a desktop
// browser, does nothing at all, because the example binds `touchstart`,
// `touchmove` and `touchend`.
//
// So the preview performs the gesture itself, and draws the contact point the
// way a device simulator does, so it reads as a demonstration rather than as an
// animation the example happens to contain.
//
// Two properties make this honest and portable:
//
//   - The events are synthesized, so `isTrusted` is false. That is also how a
//     real touch is told apart from these: the first trusted pointer or touch
//     on the view stops the playback and hands the example back to the reader.
//   - Nothing here knows about Lynx, this site, or any UI framework. It takes a
//     host element and fractional coordinates, so the same driver works for a
//     ReactLynx or Vue Lynx example, and for go-web itself.
//
// Coordinates are fractions of the host's box rather than pixels, so a set of
// steps survives a resize and does not have to know the design width.

/** A point as a fraction of the host box: `{x: 0, y: 0}` top-left, `{x: 1, y: 1}` bottom-right. */
export interface GesturePoint {
	x: number;
	y: number;
}

export interface GestureStep {
	/** Contact path. One point taps; two or more drag through each in turn. */
	path: readonly GesturePoint[];
	/** Perform this step this many times before advancing. Defaults to one. */
	iterations?: number;
	/** How long the contact lasts. */
	durationMs?: number;
	/** How long to wait after lifting, before the next step. */
	restMs?: number;
}

export interface AutoGestureOptions {
	steps: readonly GestureStep[];
	/** Repeat the sequence. */
	loop?: boolean;
	/** Wait before the first step, so the example is readable first. */
	startDelayMs?: number;
	/** Draw the contact point. */
	showPointer?: boolean;
	/**
	 * Stop as soon as the reader interacts. On by default: once someone is
	 * driving it themselves, a demonstration fighting them is worse than none.
	 */
	stopOnUserInput?: boolean;
}

export interface AutoGestureHandle {
	stop: () => void;
}

const DEFAULT_DURATION_MS = 550;
const DEFAULT_REST_MS = 2000;
const DEFAULT_START_DELAY_MS = 1200;
/** One move per frame is what a real drag produces. */
const FRAME_MS = 16;
const POINTER_SIZE = 30;

/**
 * Play `steps` against `host` until stopped.
 *
 * `host` is the element the gesture is measured against and dispatched into —
 * for a Lynx preview, the `<lynx-view>`. Events are dispatched at the deepest
 * element under each point, including through a shadow root, because that is
 * where a component's own listener lives.
 */
export function playAutoGesture(host: HTMLElement, options: AutoGestureOptions): AutoGestureHandle {
	const {
		steps,
		loop = true,
		startDelayMs = DEFAULT_START_DELAY_MS,
		showPointer = true,
		stopOnUserInput = true,
	} = options;

	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let identifier = 1;
	let activeContact:
		| {
				target: Element;
				identifier: number;
				point: { clientX: number; clientY: number };
		  }
		| undefined;
	const pointer = showPointer ? createPointer(host) : undefined;

	const endActiveContact = (): void => {
		if (!activeContact) return;
		const { target, identifier, point } = activeContact;
		activeContact = undefined;
		dispatchTouch(target, 'touchend', identifier, point);
		hidePointer(pointer);
	};

	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		if (timer) clearTimeout(timer);
		endActiveContact();
		pointer?.remove();
		for (const type of USER_INPUT_EVENTS) {
			host.removeEventListener(type, onUserInput, true);
		}
	};

	// `isTrusted` is the discriminator: only the browser can set it, so a real
	// touch is unambiguous even though the synthetic ones look identical.
	function onUserInput(event: Event): void {
		if (event.isTrusted) stop();
	}
	if (stopOnUserInput) {
		for (const type of USER_INPUT_EVENTS) {
			host.addEventListener(type, onUserInput, true);
		}
	}

	const wait = (ms: number) =>
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, ms);
		});

	async function run(): Promise<void> {
		await wait(startDelayMs);
		do {
			for (const step of steps) {
				const iterations = Math.max(1, Math.trunc(step.iterations ?? 1));
				for (let iteration = 0; iteration < iterations; iteration++) {
					if (stopped) return;
					await playStep(step);
					if (stopped) return;
					await wait(step.restMs ?? DEFAULT_REST_MS);
				}
			}
		} while (loop && !stopped);
		pointer?.remove();
	}

	async function playStep(step: GestureStep): Promise<void> {
		const box = host.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) return;
		const points = step.path.map((point) => ({
			clientX: box.left + point.x * box.width,
			clientY: box.top + point.y * box.height,
		}));
		if (points.length === 0) return;

		const id = identifier++;
		const target = deepestElementAt(host, points[0].clientX, points[0].clientY);
		if (!target) return;

		showPointerAt(pointer, host, points[0]);
		activeContact = { target, identifier: id, point: points[0] };
		dispatchTouch(target, 'touchstart', id, points[0]);

		const duration = step.durationMs ?? DEFAULT_DURATION_MS;
		const frames = Math.max(1, Math.round(duration / FRAME_MS));
		for (let frame = 1; frame <= frames; frame++) {
			if (stopped) return;
			// Ease the travel so it reads as a hand rather than a linear tween.
			const progress = easeInOutQuad(frame / frames);
			const point = interpolate(points, progress);
			showPointerAt(pointer, host, point);
			activeContact.point = point;
			dispatchTouch(target, 'touchmove', id, point);
			await wait(FRAME_MS);
		}

		if (stopped) return;
		activeContact.point = points[points.length - 1];
		endActiveContact();
	}

	void run();
	return { stop };
}

const USER_INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel'] as const;

function easeInOutQuad(t: number): number {
	return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Walk `points` as one polyline and return the position at `progress`. */
function interpolate(
	points: readonly { clientX: number; clientY: number }[],
	progress: number,
): { clientX: number; clientY: number } {
	if (points.length === 1) return points[0];
	const span = 1 / (points.length - 1);
	const index = Math.min(points.length - 2, Math.floor(progress / span));
	const local = (progress - index * span) / span;
	const from = points[index];
	const to = points[index + 1];
	return {
		clientX: from.clientX + (to.clientX - from.clientX) * local,
		clientY: from.clientY + (to.clientY - from.clientY) * local,
	};
}

/**
 * The element that would receive a real touch here.
 *
 * A Lynx page lives in a shadow root, and a component's touch listener is on an
 * element inside it, so the host itself is the wrong target — descend through
 * every shadow root under the point.
 */
function deepestElementAt(host: HTMLElement, clientX: number, clientY: number): Element | null {
	let found: Element | null =
		host.shadowRoot?.elementFromPoint(clientX, clientY) ??
		host.ownerDocument.elementFromPoint(clientX, clientY);
	while (found?.shadowRoot) {
		const next = found.shadowRoot.elementFromPoint(clientX, clientY);
		if (!next || next === found) break;
		found = next;
	}
	return found;
}

const POINTER_TYPE = {
	touchstart: 'pointerdown',
	touchmove: 'pointermove',
	touchend: 'pointerup',
} as const;

/**
 * One contact, as the browser reports it.
 *
 * Real touch input produces a pointer event *and* a touch event for every
 * contact, and a consumer may listen for either — `@lynx-js/web-core` drives
 * its gestures from the pointer stream, so dispatching only `touchstart` /
 * `touchmove` / `touchend` reaches the right element and does nothing at all.
 * Both are sent, in the order Chrome sends them.
 */
function dispatchTouch(
	target: Element,
	type: 'touchstart' | 'touchmove' | 'touchend',
	identifier: number,
	point: { clientX: number; clientY: number },
): void {
	const pointerInit: PointerEventInit = {
		bubbles: true,
		cancelable: type !== 'touchend',
		composed: true,
		pointerId: identifier,
		pointerType: 'touch',
		isPrimary: true,
		clientX: point.clientX,
		clientY: point.clientY,
		screenX: point.clientX,
		screenY: point.clientY,
		button: type === 'touchmove' ? -1 : 0,
		buttons: type === 'touchend' ? 0 : 1,
		width: 24,
		height: 24,
		pressure: type === 'touchend' ? 0 : 0.5,
	};
	target.dispatchEvent(new PointerEvent(POINTER_TYPE[type], pointerInit));

	// Touch/TouchEvent are unavailable on desktop builds without touch support;
	// the pointer half above still drives the example there.
	if (typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return;
	const touch = new Touch({
		identifier,
		target,
		clientX: point.clientX,
		clientY: point.clientY,
		pageX: point.clientX,
		pageY: point.clientY,
		screenX: point.clientX,
		screenY: point.clientY,
	});
	const touches = type === 'touchend' ? [] : [touch];
	target.dispatchEvent(
		new TouchEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			touches,
			targetTouches: touches,
			changedTouches: [touch],
		}),
	);
}

/** The simulator-style contact circle. */
function createPointer(host: HTMLElement): HTMLElement {
	const dot = document.createElement('div');
	dot.setAttribute('aria-hidden', 'true');
	dot.style.cssText = [
		'position:fixed',
		'z-index:2',
		`width:${POINTER_SIZE}px`,
		`height:${POINTER_SIZE}px`,
		'margin:0',
		'border-radius:50%',
		'background:rgba(255,255,255,0.28)',
		'border:1.5px solid rgba(255,255,255,0.65)',
		'box-shadow:0 0 12px rgba(255,255,255,0.25)',
		'pointer-events:none',
		'opacity:0',
		'transition:opacity 0.18s ease',
	].join(';');
	(host.parentElement ?? host).append(dot);
	return dot;
}

function showPointerAt(
	pointer: HTMLElement | undefined,
	host: HTMLElement,
	point: { clientX: number; clientY: number },
): void {
	if (!pointer) return;
	// `position: fixed` with viewport coordinates, so the circle lands on the
	// contact point whatever the preview is nested in or scrolled by.
	pointer.style.left = `${point.clientX - POINTER_SIZE / 2}px`;
	pointer.style.top = `${point.clientY - POINTER_SIZE / 2}px`;
	pointer.style.opacity = '1';
	// Hide it if the contact drifts outside the preview (a step whose path
	// leaves the box), rather than drawing a circle over the page.
	const box = host.getBoundingClientRect();
	const inside =
		point.clientX >= box.left &&
		point.clientX <= box.right &&
		point.clientY >= box.top &&
		point.clientY <= box.bottom;
	if (!inside) pointer.style.opacity = '0';
}

function hidePointer(pointer: HTMLElement | undefined): void {
	if (pointer) pointer.style.opacity = '0';
}
