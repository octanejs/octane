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
import { BadListenerTree } from './_fixtures/invalid-listeners.tsrx';

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
});
