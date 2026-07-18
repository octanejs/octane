// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/live-announcer/LiveAnnouncer.tsx).
// octane adaptations:
// - This is a plain-DOM utility upstream too (no React), so the port is verbatim apart
//   from the test-environment probe: upstream checks React's IS_REACT_ACT_ENVIRONMENT /
//   the jest global to skip the Safari announce delay under test; octane's suite runs
//   under vitest, so the probe also treats a defined `process.env.VITEST` as a test
//   environment. The 100ms first-announce delay for real browsers is preserved.
// - `.tsx` → `.ts` (there was never any JSX in the file).

type Assertiveness = 'assertive' | 'polite';

/* Inspired by https://github.com/AlmeroSteyn/react-aria-live */
const LIVEREGION_TIMEOUT_DELAY = 7000;

let liveAnnouncer: LiveAnnouncer | null = null;

type Message = string | { 'aria-labelledby': string };

function isTestEnvironment(): boolean {
	const g = globalThis as any;
	if (typeof g.IS_REACT_ACT_ENVIRONMENT === 'boolean') {
		return g.IS_REACT_ACT_ENVIRONMENT;
	}
	return typeof g.jest !== 'undefined' || g.process?.env?.VITEST !== undefined;
}

/**
 * Announces the message using screen reader technology.
 */
export function announce(
	message: Message,
	assertiveness: Assertiveness = 'assertive',
	timeout: number = LIVEREGION_TIMEOUT_DELAY,
): void {
	if (!liveAnnouncer) {
		liveAnnouncer = new LiveAnnouncer();
		// wait for the live announcer regions to be added to the dom, then announce
		// otherwise Safari won't announce the message if it's added too quickly
		// found most times less than 100ms were not consistent when announcing with Safari

		// if we're in a test environment, announce without waiting
		if (!isTestEnvironment()) {
			setTimeout(() => {
				if (liveAnnouncer?.isAttached()) {
					liveAnnouncer?.announce(message, assertiveness, timeout);
				}
			}, 100);
		} else {
			liveAnnouncer.announce(message, assertiveness, timeout);
		}
	} else {
		liveAnnouncer.announce(message, assertiveness, timeout);
	}
}

/**
 * Stops all queued announcements.
 */
export function clearAnnouncer(assertiveness: Assertiveness): void {
	if (liveAnnouncer) {
		liveAnnouncer.clear(assertiveness);
	}
}

/**
 * Removes the announcer from the DOM.
 */
export function destroyAnnouncer(): void {
	if (liveAnnouncer) {
		liveAnnouncer.destroy();
		liveAnnouncer = null;
	}
}

// LiveAnnouncer is implemented using vanilla DOM, not the framework. Upstream keeps it
// framework-free so the global announce() API works without a root or portal; the same
// reasoning applies verbatim in octane.
class LiveAnnouncer {
	node: HTMLElement | null = null;
	assertiveLog: HTMLElement | null = null;
	politeLog: HTMLElement | null = null;

	constructor() {
		if (typeof document !== 'undefined') {
			this.node = document.createElement('div');
			this.node.dataset.liveAnnouncer = 'true';
			// copied from VisuallyHidden
			Object.assign(this.node.style, {
				border: 0,
				clip: 'rect(0 0 0 0)',
				clipPath: 'inset(50%)',
				height: '1px',
				margin: '-1px',
				overflow: 'hidden',
				padding: 0,
				position: 'absolute',
				width: '1px',
				whiteSpace: 'nowrap',
			});

			this.assertiveLog = this.createLog('assertive');
			this.node.appendChild(this.assertiveLog);

			this.politeLog = this.createLog('polite');
			this.node.appendChild(this.politeLog);

			document.body.prepend(this.node);
		}
	}

	isAttached() {
		return this.node?.isConnected;
	}

	createLog(ariaLive: string) {
		let node = document.createElement('div');
		node.setAttribute('role', 'log');
		node.setAttribute('aria-live', ariaLive);
		node.setAttribute('aria-relevant', 'additions');
		return node;
	}

	destroy() {
		if (!this.node) {
			return;
		}

		document.body.removeChild(this.node);
		this.node = null;
	}

	announce(message: Message, assertiveness = 'assertive', timeout = LIVEREGION_TIMEOUT_DELAY) {
		if (!this.node) {
			return;
		}

		let node = document.createElement('div');
		if (typeof message === 'object') {
			// To read an aria-labelledby, the element must have an appropriate role, such as img.
			node.setAttribute('role', 'img');
			node.setAttribute('aria-labelledby', message['aria-labelledby']);
		} else {
			node.textContent = message;
		}

		if (assertiveness === 'assertive') {
			this.assertiveLog?.appendChild(node);
		} else {
			this.politeLog?.appendChild(node);
		}

		if (message !== '') {
			setTimeout(() => {
				node.remove();
			}, timeout);
		}
	}

	clear(assertiveness: Assertiveness) {
		if (!this.node) {
			return;
		}

		if ((!assertiveness || assertiveness === 'assertive') && this.assertiveLog) {
			this.assertiveLog.innerHTML = '';
		}

		if ((!assertiveness || assertiveness === 'polite') && this.politeLog) {
			this.politeLog.innerHTML = '';
		}
	}
}
