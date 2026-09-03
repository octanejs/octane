/**
 * Conformance adaptation of the latest
 * react-dom/src/__tests__/InvalidEventListeners-test.js. Invalid listeners warn
 * when the host prop is applied and surface an uncaught error at dispatch.
 *
 * OCTANE DIVERGENCE: delegated events retain Octane's platform-style guarded
 * listener invocations. Reporting one invalid target listener therefore does
 * not prevent an independently registered ancestor listener from running.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, createLog } from '../_helpers';
import {
	BadCaptureListenerTree,
	BadListenerTree,
	BadLoadListener,
	BadScrollListener,
	CustomListenerVariants,
	ThrowingListenerTree,
} from './_fixtures/invalid-listeners.tsrx';

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function listenerMessage(type: string): string {
	return `Expected \`onClick\` listener to be a function, instead got a value of \`${type}\` type.`;
}

function dispatchMessage(type: string): string {
	return PROD_COMPILE
		? `Expected click event listener to be a function, instead got a value of \`${type}\` type.`
		: listenerMessage(type);
}

function expectRenderWarning(error: ReturnType<typeof vi.spyOn>, message: string): void {
	expect(error.mock.calls).toEqual(PROD_COMPILE ? [] : [[message]]);
}

function exerciseInvalidListener(value: unknown): { error: unknown; log: string[] } {
	const log = createLog();
	const uncaught: unknown[] = [];
	const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	const onError = (event: ErrorEvent) => {
		uncaught.push(event.error);
		event.preventDefault();
	};
	window.addEventListener('error', onError);
	const root = mount(BadListenerTree, { onAnc: () => log.push('anc'), bad: value });
	try {
		return {
			error: (() => {
				consoleError.mockClear();
				root.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
				expect(consoleError).not.toHaveBeenCalled();
				expect(uncaught).toHaveLength(1);
				return uncaught[0];
			})(),
			log: log.drain(),
		};
	} finally {
		root.unmount();
		window.removeEventListener('error', onError);
		consoleError.mockRestore();
	}
}

describe('InvalidEventListeners', () => {
	// Per latest InvalidEventListeners-test.js:36. React warns while applying the
	// prop, then getListener throws the same actionable Error at dispatch.
	it.each([
		{ value: 'not a function', type: 'string', label: 'string' },
		{ value: 42, type: 'number', label: 'number' },
		{ value: true, type: 'boolean', label: 'boolean' },
		{ value: {}, type: 'object', label: 'object' },
		{ value: { args: [] }, type: 'object', label: 'object with an args array' },
	])('a $label listener warns at render and reports an Error at dispatch', ({ value, type }) => {
		const renderError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof mount> | undefined;
		try {
			root = mount(BadListenerTree, { onAnc: () => undefined, bad: value });
			expectRenderWarning(renderError, listenerMessage(type));
		} finally {
			root?.unmount();
			renderError.mockRestore();
		}

		const result = exerciseInvalidListener(value);
		expect(result.log).toEqual(['anc']);
		expect(result.error).toEqual(expect.objectContaining({ message: dispatchMessage(type) }));
	});

	it('does not mistake user listener data for compiler-owned event metadata', () => {
		const impostor = vi.fn();
		const value = { fn: impostor, args: [] };
		const renderError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof mount> | undefined;
		try {
			root = mount(BadListenerTree, { onAnc: () => undefined, bad: value });
			expectRenderWarning(renderError, listenerMessage('object'));
		} finally {
			root?.unmount();
			renderError.mockRestore();
		}

		const result = exerciseInvalidListener(value);
		expect(impostor).not.toHaveBeenCalled();
		expect(result.log).toEqual(['anc']);
		expect(result.error).toEqual(expect.objectContaining({ message: dispatchMessage('object') }));
	});

	// ReactDOMComponent's dedicated false guidance is distinct from the generic
	// boolean warning. Because getListener's truthiness guard lets false through,
	// dispatch then reports the invocation's TypeError rather than the message above.
	it('a false listener gets conditional-omission guidance and a dispatch TypeError', () => {
		const renderError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof mount> | undefined;
		try {
			root = mount(BadListenerTree, { onAnc: () => undefined, bad: false });
			expectRenderWarning(
				renderError,
				'Expected `onClick` listener to be a function, instead got `false`.\n\n' +
					'If you used to conditionally omit it with onClick={condition && value}, ' +
					'pass onClick={condition ? value : undefined} instead.',
			);
		} finally {
			root?.unmount();
			renderError.mockRestore();
		}

		const result = exerciseInvalidListener(false);
		expect(result.log).toEqual(['anc']);
		expect(result.error).toBeInstanceOf(TypeError);
		expect(String((result.error as Error).message)).toMatch(/not a function/);
	});

	// Per latest InvalidEventListeners-test.js:84. Null is the supported way to
	// omit a listener: no render warning, dispatch failure, or propagation break.
	it('a null listener is skipped without warning, error, or blocking', () => {
		const log = createLog();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const errors: string[] = [];
		const onError = (event: ErrorEvent) => {
			errors.push(String(event.message));
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		const root = mount(BadListenerTree, { onAnc: () => log.push('anc'), bad: null });
		try {
			root.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log.drain()).toEqual(['anc']);
			expect(errors).toEqual([]);
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('error', onError);
			consoleError.mockRestore();
			root.unmount();
		}
	});

	// Per InvalidEventListeners-test.js:36. Capture listeners have the same
	// render-time validation and authored-prop dispatch diagnostic as bubble listeners.
	it('an invalid capture listener names its capture prop and preserves ancestor dispatch', () => {
		const log = createLog();
		const uncaught: unknown[] = [];
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = (event: ErrorEvent) => {
			uncaught.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		const root = mount(BadCaptureListenerTree, {
			onAnc: () => log.push('ancestor capture'),
			bad: 'not a capture listener',
		});
		try {
			expectRenderWarning(
				consoleError,
				'Expected `onClickCapture` listener to be a function, instead got a value of `string` type.',
			);
			consoleError.mockClear();
			root.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log.drain()).toEqual(['ancestor capture']);
			expect(uncaught).toHaveLength(1);
			expect(uncaught[0]).toEqual(
				expect.objectContaining({
					message: PROD_COMPILE
						? 'Expected click event listener to be a function, instead got a value of `string` type.'
						: 'Expected `onClickCapture` listener to be a function, instead got a value of `string` type.',
				}),
			);
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			window.removeEventListener('error', onError);
			consoleError.mockRestore();
		}
	});

	// Per InvalidEventListeners-test.js:36. Replacing a bad listener must
	// restore ordinary event delivery without retaining its prior diagnostic.
	it('replacing an invalid listener restores the active callback without another warning', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const onAncestor = vi.fn();
		const replacement = vi.fn();
		const root = mount(BadListenerTree, { onAnc: onAncestor, bad: 42 });
		try {
			expectRenderWarning(consoleError, listenerMessage('number'));
			consoleError.mockClear();
			root.update(BadListenerTree, { onAnc: onAncestor, bad: replacement });
			expect(consoleError).not.toHaveBeenCalled();
			root.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(replacement).toHaveBeenCalledOnce();
			expect(onAncestor).toHaveBeenCalledOnce();
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			consoleError.mockRestore();
		}
	});

	// Per InvalidEventListeners-test.js:36. Replacing a valid listener with a
	// different invalid value validates the current prop and names its new type.
	it('replacing a usable listener with an invalid value reports the new listener type', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const onAncestor = vi.fn();
		const root = mount(BadListenerTree, { onAnc: onAncestor, bad: () => undefined });
		try {
			expect(consoleError).not.toHaveBeenCalled();
			root.update(BadListenerTree, { onAnc: onAncestor, bad: true });
			expectRenderWarning(consoleError, listenerMessage('boolean'));
		} finally {
			root.unmount();
			consoleError.mockRestore();
		}
	});

	// Per InvalidEventListeners-test.js:36 and ReactDOMComponent-test.js:1711.
	// Native scroll/load are heard through capture-phase delegation, so invalid
	// listeners must retain the same authored prop and dispatch diagnostics.
	it.each([
		{ component: BadScrollListener, prop: 'onScroll', event: 'scroll' },
		{ component: BadLoadListener, prop: 'onLoad', event: 'load' },
	])(
		'validates the non-bubbling $prop listener and reports its dispatch error',
		({ component, prop, event }) => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const uncaught: unknown[] = [];
			const handleError = (value: ErrorEvent) => {
				uncaught.push(value.error);
				value.preventDefault();
			};
			window.addEventListener('error', handleError);
			const root = mount(component, { bad: 'invalid native listener' });
			try {
				expectRenderWarning(
					consoleError,
					`Expected \`${prop}\` listener to be a function, instead got a value of \`string\` type.`,
				);
				consoleError.mockClear();
				root.find('.target').dispatchEvent(new Event(event, { bubbles: false }));
				expect(uncaught).toHaveLength(1);
				expect((uncaught[0] as Error).message).toBe(
					PROD_COMPILE
						? `Expected ${event} event listener to be a function, instead got a value of \`string\` type.`
						: `Expected \`${prop}\` listener to be a function, instead got a value of \`string\` type.`,
				);
				expect(consoleError).not.toHaveBeenCalled();
			} finally {
				root.unmount();
				window.removeEventListener('error', handleError);
				consoleError.mockRestore();
			}
		},
	);

	// Per ReactDOMEventListener-test.js:1197. User errors preserve their exact
	// identity and surface once through the browser's uncaught-error channel;
	// Octane's guarded native dispatch still reaches the ancestor listener.
	it('reports an exactly-once throwing listener error and continues ancestor dispatch', () => {
		const original = new Error('authored listener failure');
		const ancestor = vi.fn();
		const uncaught: unknown[] = [];
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const handleError = (event: ErrorEvent) => {
			uncaught.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', handleError);
		const root = mount(ThrowingListenerTree, {
			onAnc: ancestor,
			onTarget: () => {
				throw original;
			},
		});
		try {
			expect(consoleError).not.toHaveBeenCalled();
			root.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(uncaught).toEqual([original]);
			expect(ancestor).toHaveBeenCalledOnce();
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			window.removeEventListener('error', handleError);
			consoleError.mockRestore();
		}
	});

	// Per DOMPropertyOperations-test.js:251, :267, :283, :467, and :975.
	// Custom-element events retain authored capitalization/dashes and capture
	// registration, with identity-preserving replacement and complete removal.
	it('attaches, replaces, and removes uppercase, dashed, and capture custom listeners', () => {
		const upper = vi.fn();
		const lower = vi.fn();
		const dashed = vi.fn();
		const capture = vi.fn();
		const replacement = vi.fn();
		const root = mount(CustomListenerVariants, { upper, lower, dashed, capture });
		try {
			const target = root.find('.target');
			target.dispatchEvent(new CustomEvent('customevent', { bubbles: true }));
			expect(upper).not.toHaveBeenCalled();
			target.dispatchEvent(new CustomEvent('CustomEvent', { bubbles: true }));
			target.dispatchEvent(new CustomEvent('custom-event', { bubbles: true }));
			expect(upper).toHaveBeenCalledOnce();
			expect(lower).toHaveBeenCalledOnce();
			expect(dashed).toHaveBeenCalledOnce();
			expect(capture).toHaveBeenCalledOnce();
			expect(capture.mock.invocationCallOrder[0]).toBeLessThan(lower.mock.invocationCallOrder[0]);

			root.update(CustomListenerVariants, {
				upper: undefined,
				lower: replacement,
				dashed: undefined,
				capture: undefined,
			});
			expect(root.find('.target')).toBe(target);
			target.dispatchEvent(new CustomEvent('customevent', { bubbles: true }));
			target.dispatchEvent(new CustomEvent('CustomEvent', { bubbles: true }));
			target.dispatchEvent(new CustomEvent('custom-event', { bubbles: true }));
			expect(upper).toHaveBeenCalledOnce();
			expect(lower).toHaveBeenCalledOnce();
			expect(dashed).toHaveBeenCalledOnce();
			expect(capture).toHaveBeenCalledOnce();
			expect(replacement).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	// Per DOMPropertyOperations-test.js:322. Custom elements deliberately keep
	// non-function lowercase on* values as raw attributes instead of warning.
	it('keeps non-function custom-event values as attributes without listener warnings', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(CustomListenerVariants, {
			upper: undefined,
			lower: 'raw listener attribute',
			dashed: false,
			capture: undefined,
		});
		try {
			const target = root.find('.target');
			expect(target.getAttribute('oncustomevent')).toBe('raw listener attribute');
			expect(target.hasAttribute('oncustom-event')).toBe(false);
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			consoleError.mockRestore();
		}
	});

	// Per DOMPropertyOperations-test.js:1126. Updating the same custom-event
	// prop across function, string, and function values must detach/re-attach
	// exactly once while preserving custom elements' raw attribute semantics.
	it('alternates custom-event callbacks and string attributes without stale listeners', () => {
		const initial = vi.fn();
		const replacement = vi.fn();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = mount(CustomListenerVariants, {
			upper: undefined,
			lower: initial,
			dashed: undefined,
			capture: undefined,
		});
		try {
			const target = root.find('.target');
			target.dispatchEvent(new CustomEvent('customevent', { bubbles: true }));
			expect(initial).toHaveBeenCalledOnce();

			root.update(CustomListenerVariants, {
				upper: undefined,
				lower: 'raw custom-event value',
				dashed: undefined,
				capture: undefined,
			});
			expect(root.find('.target')).toBe(target);
			expect(target.getAttribute('oncustomevent')).toBe('raw custom-event value');
			target.dispatchEvent(new CustomEvent('customevent', { bubbles: true }));
			expect(initial).toHaveBeenCalledOnce();

			root.update(CustomListenerVariants, {
				upper: undefined,
				lower: replacement,
				dashed: undefined,
				capture: undefined,
			});
			expect(target.hasAttribute('oncustomevent')).toBe(false);
			target.dispatchEvent(new CustomEvent('customevent', { bubbles: true }));
			expect(initial).toHaveBeenCalledOnce();
			expect(replacement).toHaveBeenCalledOnce();
			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			root.unmount();
			consoleError.mockRestore();
		}
	});
});
