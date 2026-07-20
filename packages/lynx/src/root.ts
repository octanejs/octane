import {
	createUniversalRoot,
	type UniversalComponent,
	type UniversalPreparedAttempt,
	type UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	createLynxClientContainer,
	createLynxClientDriver,
	type LynxClientContainer,
	type LynxPublicHandle,
} from './core/client-driver.js';
import { createLynxBackgroundTransport, type LynxBackgroundTransport } from './core/transport.js';
import type { LynxContextProxy } from './core/protocol.js';
import type { LynxCreateSelectorQuery } from './core/nodes-ref.js';

interface LynxBackgroundGlobals {
	readonly lynx?: {
		getCoreContext?(): LynxContextProxy;
		getJSModule?(name: string): unknown;
		queueMicrotask?(callback: () => void): void;
		createSelectorQuery?: LynxCreateSelectorQuery;
	};
	readonly queueMicrotask?: (callback: () => void) => void;
}

export interface CreateLynxRootOptions {
	/** Background-thread global object. Defaults to the current global object. */
	readonly target?: object;
	/** Explicit public ContextProxy, primarily for framework bootstrap and tests. */
	readonly context?: LynxContextProxy;
	/** Explicit scheduler when neither Lynx nor the JS runtime supplies one. */
	readonly scheduleMicrotask?: (callback: () => void) => void;
	readonly onDiagnostic?: (error: Error) => void;
}

export interface LynxRoot {
	readonly renderer: 'lynx';
	readonly ready: Promise<void>;
	render<Props>(
		component: UniversalComponent<Props>,
		props?: Props,
	): Promise<UniversalPreparedAttempt>;
	flushTransport(): Promise<void>;
	unmount(): Promise<void>;
}

interface LynxRootState {
	readonly transport: LynxBackgroundTransport;
	status: 'active' | 'unmounting' | 'unmounted';
	unmount: Promise<void> | null;
}

function readBackgroundGlobals(target: object): LynxBackgroundGlobals {
	if (target === null || typeof target !== 'object') {
		throw new TypeError('Octane Lynx root target must be a background-thread global object.');
	}
	const globals = target as LynxBackgroundGlobals;
	if (typeof globals.lynx?.getJSModule !== 'function') {
		throw new Error('Octane Lynx roots are available only in the Lynx background runtime.');
	}
	return globals;
}

function resolveContext(
	target: LynxBackgroundGlobals,
	explicit?: LynxContextProxy,
): LynxContextProxy {
	if (explicit !== undefined) return explicit;
	const getCoreContext = target.lynx?.getCoreContext;
	if (typeof getCoreContext !== 'function') {
		throw new Error('Octane Lynx requires the public background-thread lynx.getCoreContext() API.');
	}
	return getCoreContext.call(target.lynx);
}

function resolveMicrotaskScheduler(
	target: LynxBackgroundGlobals,
	explicit?: (callback: () => void) => void,
): (callback: () => void) => void {
	if (explicit !== undefined) {
		if (typeof explicit !== 'function') {
			throw new TypeError('Octane Lynx scheduleMicrotask must be a function.');
		}
		return explicit;
	}
	const lynxScheduler = target.lynx?.queueMicrotask;
	if (typeof lynxScheduler === 'function') {
		return (callback) => lynxScheduler.call(target.lynx, callback);
	}
	if (typeof target.queueMicrotask === 'function') {
		return (callback) => target.queueMicrotask!(callback);
	}
	throw new Error(
		'Octane Lynx requires lynx.queueMicrotask() or createLynxRoot({ scheduleMicrotask }).',
	);
}

function identityAdvanced(
	previous: UniversalTransportIdentity | null,
	next: UniversalTransportIdentity | null,
): boolean {
	return (
		next !== null &&
		(previous === null || previous.root !== next.root || previous.version !== next.version)
	);
}

/** Create one background-owned root and its isolated async transport state. */
export function createLynxRoot(options: CreateLynxRootOptions = {}): LynxRoot {
	const target = readBackgroundGlobals(options.target ?? globalThis);
	const context = resolveContext(target, options.context);
	const scheduleMicrotask = resolveMicrotaskScheduler(target, options.scheduleMicrotask);
	const createSelectorQuery = target.lynx?.createSelectorQuery;
	const container = createLynxClientContainer({
		createSelectorQuery:
			typeof createSelectorQuery === 'function'
				? () => createSelectorQuery.call(target.lynx)
				: undefined,
	});
	const transport = createLynxBackgroundTransport(context, container, {
		onDiagnostic: options.onDiagnostic,
	});
	const universalRoot = createUniversalRoot<LynxClientContainer, LynxPublicHandle>(
		container,
		createLynxClientDriver(),
		{ scheduleMicrotask, transport },
	);
	transport.bindRoot(universalRoot);

	const state: LynxRootState = {
		transport,
		status: 'active',
		unmount: null,
	};

	const facade: LynxRoot = {
		render(component, props) {
			if (state.status !== 'active') {
				return Promise.reject(new Error('Cannot render an unmounting or unmounted Lynx root.'));
			}
			if (typeof component !== 'function') {
				return Promise.reject(new TypeError('Lynx root render() requires a component function.'));
			}
			return universalRoot.renderAsync(component, props === undefined ? ({} as never) : props);
		},
		flushTransport() {
			return universalRoot.flushTransport();
		},
		get ready() {
			return transport.ready;
		},
		get renderer() {
			return 'lynx' as const;
		},
		unmount() {
			if (state.unmount !== null) return state.unmount;
			state.status = 'unmounting';
			state.unmount = (async () => {
				const acceptedBefore = transport.acceptedIdentity();
				if (acceptedBefore === null) {
					await transport.cancelPendingBeforeReady(
						new Error('Octane Lynx root was unmounted before main became ready.'),
					);
				}
				if (transport.closedReason() !== null) transport.enableLogicalTeardown();
				const preparationBeforeUnmount = transport.preparationCount();
				let unmountFailed = false;
				let unmountError: unknown;
				try {
					await universalRoot.unmountAsync();
				} catch (error) {
					unmountFailed = true;
					unmountError = error;
				}
				if (unmountFailed && transport.closedReason() !== null) {
					transport.enableLogicalTeardown();
					try {
						await universalRoot.unmountAsync();
					} catch (cleanupError) {
						if (unmountError === undefined) unmountError = cleanupError;
					}
				}

				const acceptedAfter = transport.acceptedIdentity();
				const transportPreparedTeardown = transport.preparationCount() !== preparationBeforeUnmount;
				const hostAccepted =
					!unmountFailed ||
					identityAdvanced(acceptedBefore, acceptedAfter) ||
					!transportPreparedTeardown ||
					transport.closedReason() !== null;
				if (!hostAccepted) {
					state.status = 'active';
					state.unmount = null;
					throw unmountError;
				}

				let disposeFailed = false;
				let disposeError: unknown;
				try {
					if (acceptedAfter !== null && transport.closedReason() === null) {
						await transport.dispose();
					}
				} catch (error) {
					disposeFailed = true;
					disposeError = error;
				} finally {
					transport.close(disposeFailed ? disposeError : unmountFailed ? unmountError : undefined);
					state.status = 'unmounted';
				}
				if (unmountFailed) throw unmountError;
				if (disposeFailed) throw disposeError;
			})();
			return state.unmount;
		},
	};
	return Object.freeze(facade);
}

let defaultRoot: LynxRoot | null = null;

function getDefaultRoot(): LynxRoot {
	return (defaultRoot ??= createLynxRoot());
}

/** Lazy background page root used by the standard Rspeedy entry. */
export const root: LynxRoot = Object.freeze({
	get renderer() {
		return 'lynx' as const;
	},
	get ready() {
		return getDefaultRoot().ready;
	},
	render<Props>(component: UniversalComponent<Props>, props?: Props) {
		return getDefaultRoot().render(component, props);
	},
	flushTransport() {
		return getDefaultRoot().flushTransport();
	},
	unmount() {
		return getDefaultRoot().unmount();
	},
});
