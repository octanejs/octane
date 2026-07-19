import { createPhase0PAPIAdapter } from './papi.mjs';
import {
	createPhase0BackgroundProbe,
	createPhase0MainThreadReceiver,
	PHASE_0_PROTOCOL,
} from './protocol.mjs';

const BATCH_MESSAGE = 'octane-lynx-phase-0:batch';
const ACK_MESSAGE = 'octane-lynx-phase-0:ack';
const MAIN_READY_MESSAGE = 'octane-lynx-phase-0:main-ready';
const MAIN_READY_REQUEST_MESSAGE = 'octane-lynx-phase-0:main-ready-request';

function sendContextMessage(context, data) {
	if (typeof context.postMessage === 'function') {
		context.postMessage(data);
		return;
	}
	if (typeof context.dispatchEvent === 'function') {
		context.dispatchEvent({ type: 'message', data });
		return;
	}
	throw new Error('Octane Lynx Phase 0 requires a cross-thread message context.');
}

function addContextListener(context, listener) {
	if (typeof context.addEventListener !== 'function') {
		throw new Error('Octane Lynx Phase 0 requires context.addEventListener().');
	}
	context.addEventListener('message', listener);
	return () => context.removeEventListener?.('message', listener);
}

export function installPhase0MainThread(target = globalThis) {
	const context = target.lynx?.getJSContext?.();
	if (!context) {
		throw new Error('Octane Lynx Phase 0 requires lynx.getJSContext() on the main thread.');
	}

	const papi = createPhase0PAPIAdapter(target);
	const receiver = createPhase0MainThreadReceiver(papi);
	const removeMessageListener = addContextListener(context, (event) => {
		const message = event?.data;
		if (message?.type === MAIN_READY_REQUEST_MESSAGE) {
			sendContextMessage(context, { type: MAIN_READY_MESSAGE });
			return;
		}
		if (message?.type !== BATCH_MESSAGE) return;

		try {
			const acknowledgement = receiver.receive(message.batch);
			sendContextMessage(context, {
				type: ACK_MESSAGE,
				requestId: message.requestId,
				acknowledgement,
			});
		} catch (error) {
			sendContextMessage(context, {
				type: ACK_MESSAGE,
				requestId: message.requestId,
				rejection: {
					...PHASE_0_PROTOCOL,
					type: 'reject',
					version: message.batch?.version,
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	});
	sendContextMessage(context, { type: MAIN_READY_MESSAGE });

	return Object.freeze({
		papi,
		receiver,
		destroy() {
			removeMessageListener();
		},
	});
}

export function installPhase0Background(target = globalThis) {
	const context = target.lynx?.getCoreContext?.();
	if (!context) {
		throw new Error('Octane Lynx Phase 0 requires lynx.getCoreContext() in the background.');
	}

	const pending = new Map();
	let nextRequestId = 1;
	let postedAnyCommit = false;
	let mainReadyCancelled = false;
	let resolveMainReady;
	let rejectMainReady;
	const mainReady = new Promise((resolve, reject) => {
		resolveMainReady = resolve;
		rejectMainReady = reject;
	});
	let mainReadySettled = false;
	function markMainReady() {
		if (mainReadySettled) return;
		mainReadySettled = true;
		resolveMainReady();
	}
	function cancelMainReady() {
		if (mainReadySettled) return;
		mainReadySettled = true;
		mainReadyCancelled = true;
		rejectMainReady(
			new Error('Octane Lynx Phase 0 background transport was destroyed before main ready.'),
		);
	}
	const removeMessageListener = addContextListener(context, (event) => {
		const message = event?.data;
		if (message?.type === MAIN_READY_MESSAGE) {
			markMainReady();
			return;
		}
		if (message?.type !== ACK_MESSAGE) return;

		const deferred = pending.get(message.requestId);
		if (!deferred) return;
		pending.delete(message.requestId);
		if (message.rejection) {
			deferred.reject(new Error(message.rejection.message));
		} else {
			deferred.resolve(message.acknowledgement);
		}
	});
	sendContextMessage(context, { type: MAIN_READY_REQUEST_MESSAGE });

	const probe = createPhase0BackgroundProbe(async (batch) => {
		if (batch.type === 'destroy' && mainReadyCancelled && !postedAnyCommit) {
			return {
				...PHASE_0_PROTOCOL,
				type: 'destroy-ack',
				acceptedVersion: 0,
			};
		}
		await mainReady;
		return new Promise((resolve, reject) => {
			const requestId = nextRequestId++;
			pending.set(requestId, { resolve, reject });
			try {
				sendContextMessage(context, {
					type: BATCH_MESSAGE,
					requestId,
					batch,
				});
				if (batch.type === 'commit') postedAnyCommit = true;
			} catch (error) {
				pending.delete(requestId);
				reject(error);
			}
		});
	});

	let lastEvent = Promise.resolve();
	function deliverNativeEvent(listenerId, event) {
		lastEvent = probe.handleNativeEvent(listenerId, event);
		return lastEvent;
	}

	const ready = probe.mount();
	let destroyOperation;
	return Object.freeze({
		probe,
		ready,
		deliverNativeEvent,
		get lastEvent() {
			return lastEvent;
		},
		destroy() {
			if (destroyOperation !== undefined) return destroyOperation;
			cancelMainReady();
			destroyOperation = probe.destroy().finally(() => {
				removeMessageListener();
				for (const deferred of pending.values()) {
					deferred.reject(new Error('Octane Lynx Phase 0 background transport was destroyed.'));
				}
				pending.clear();
			});
			return destroyOperation;
		},
	});
}
