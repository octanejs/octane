import type { State } from '@wagmi/core';
import { getChainId, getConnection, type Config } from '@wagmi/core';

export const HYDRATION_VERSION = 1;
export const MAX_HYDRATION_BYTES = 16_384;

export class LiveConnectionRequiredError extends Error {
	override name = 'LiveConnectionRequiredError';
	constructor() {
		super('A current live connector is required for this privileged action.');
	}
}

export class ActionContextChangedError extends Error {
	override name = 'ActionContextChangedError';
	readonly phase: 'before-dispatch' | 'after-dispatch';
	constructor(phase: 'before-dispatch' | 'after-dispatch') {
		super(
			phase === 'before-dispatch'
				? 'Wallet context changed before dispatch; the action was cancelled.'
				: 'Wallet context changed after dispatch; the result is indeterminate and quarantined.',
		);
		this.phase = phase;
	}
}

export type SecureMutationAction = 'privileged' | 'switchChain' | 'switchConnection';

function actionContext(config: Config) {
	const connection = getConnection(config);
	return {
		address: connection.address,
		chainId: connection.status === 'connected' ? connection.chainId : getChainId(config),
		connector: connection.connector?.uid,
		status: connection.status,
	};
}

function sameContext(a: ReturnType<typeof actionContext>, b: ReturnType<typeof actionContext>) {
	return (
		a.address === b.address &&
		a.chainId === b.chainId &&
		a.connector === b.connector &&
		a.status === b.status
	);
}

function sameIdentity(a: ReturnType<typeof actionContext>, b: ReturnType<typeof actionContext>) {
	return a.address === b.address && a.connector === b.connector && a.status === b.status;
}

function variableRecord(value: unknown): Record<string, any> {
	return isRecord(value) ? value : {};
}

function connectorUid(value: unknown): string | undefined {
	return isRecord(value) && typeof value.uid === 'string' ? value.uid : undefined;
}

function accountAddress(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	return isRecord(value) && typeof value.address === 'string' ? value.address : undefined;
}

function sameAddress(a: string | undefined, b: string | undefined) {
	return a?.toLowerCase() === b?.toLowerCase();
}

function variablesMatchLiveContext(
	variables: unknown,
	context: ReturnType<typeof actionContext>,
	action: SecureMutationAction,
) {
	const input = variableRecord(variables);
	if (action !== 'switchConnection' && 'connector' in input) {
		if (connectorUid(input.connector) !== context.connector) return false;
	}
	if ('account' in input && !sameAddress(accountAddress(input.account), context.address))
		return false;
	return true;
}

function validPostDispatchContext(
	action: SecureMutationAction,
	before: ReturnType<typeof actionContext>,
	after: ReturnType<typeof actionContext>,
	variables: unknown,
	result: unknown,
) {
	if (action === 'privileged') return sameContext(before, after);
	if (action === 'switchChain') {
		const chainId = variableRecord(variables).chainId;
		return sameIdentity(before, after) && after.chainId === chainId;
	}

	const targetUid = connectorUid(variableRecord(variables).connector);
	const returned = variableRecord(result);
	const returnedAddress = Array.isArray(returned.accounts) ? returned.accounts[0] : undefined;
	return (
		after.status === 'connected' &&
		after.connector === targetUid &&
		(typeof returned.chainId !== 'number' || after.chainId === returned.chainId) &&
		(typeof returnedAddress !== 'string' || sameAddress(after.address, returnedAddress))
	);
}

/**
 * Hardens a Wagmi mutation option object without retrying wallet prompts.
 * Late success is deliberately converted to a typed quarantined error.
 */
export function secureMutationOptions(
	config: Config,
	options: Record<string, any>,
	displayed = actionContext(config),
	action: SecureMutationAction = 'privileged',
) {
	const mutationFn = options.mutationFn;
	if (typeof mutationFn !== 'function') return { ...options, retry: false };
	return {
		...options,
		retry: false,
		async mutationFn(variables: unknown) {
			const before = actionContext(config);
			const disconnectedLocalSwitch =
				action === 'switchChain' &&
				before.status === 'disconnected' &&
				!before.connector &&
				!('connector' in variableRecord(variables));
			if (!disconnectedLocalSwitch && (before.status !== 'connected' || !before.connector))
				throw new LiveConnectionRequiredError();
			if (!sameContext(displayed, before)) throw new ActionContextChangedError('before-dispatch');
			if (!variablesMatchLiveContext(variables, before, action))
				throw new ActionContextChangedError('before-dispatch');
			const result = await mutationFn(variables);
			if (!validPostDispatchContext(action, before, actionContext(config), variables, result))
				throw new ActionContextChangedError('after-dispatch');
			return result;
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeState(value: unknown): value is State {
	if (!isRecord(value)) return false;
	if (!['connected', 'connecting', 'disconnected', 'reconnecting'].includes(String(value.status)))
		return false;
	if (!Array.isArray(value.connections) && !(value.connections instanceof Map)) return false;
	if (typeof value.chainId !== 'number' || !Number.isSafeInteger(value.chainId)) return false;
	return true;
}

/** Parse an untrusted SSR/cookie hint. Connector and provider objects are never accepted. */
export function parseHydratedState(input: string): State | undefined {
	if (new TextEncoder().encode(input).byteLength > MAX_HYDRATION_BYTES) return undefined;
	try {
		const envelope: unknown = JSON.parse(input);
		if (!isRecord(envelope) || envelope.version !== HYDRATION_VERSION) return undefined;
		if (!isSafeState(envelope.state)) return undefined;
		const state = envelope.state as unknown as Record<string, unknown>;
		if ('connector' in state || 'provider' in state || 'signature' in state || 'token' in state)
			return undefined;
		return {
			...(envelope.state as State),
			// Untrusted JSON cannot carry live connector instances. Connections are
			// deliberately rebuilt by Wagmi reconnect rather than trusted here.
			connections: new Map(),
			current: null,
			status: 'disconnected',
		};
	} catch {
		return undefined;
	}
}

export function serializeHydratedState(state: State): string | undefined {
	const connections = state.connections instanceof Map ? [] : state.connections;
	const safe = {
		version: HYDRATION_VERSION,
		state: { chainId: state.chainId, connections, current: state.current, status: state.status },
	};
	const value = JSON.stringify(safe);
	return new TextEncoder().encode(value).byteLength <= MAX_HYDRATION_BYTES ? value : undefined;
}
