import { formatClientError } from '../error-codes.client.generated.js';
export class ScopeDisposedError extends Error {
	constructor(scopeKey: string) {
		super(formatClientError(151, scopeKey));
		this.name = 'ScopeDisposedError';
	}
}

export class SignalWriteError extends Error {
	constructor() {
		super(formatClientError(152));
		this.name = 'SignalWriteError';
	}
}

export class SignalCycleError extends Error {
	constructor(key: string) {
		super(formatClientError(153, key));
		this.name = 'SignalCycleError';
	}
}

export class SignalIdleError extends Error {
	constructor(key: string) {
		super(formatClientError(113, key));
		this.name = 'SignalIdleError';
	}
}

export class SignalFrameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SignalFrameError';
	}
}

export class SignalStreamError extends Error {
	readonly code: string;
	constructor(code: string) {
		super(formatClientError(154, code));
		this.code = code;
		this.name = 'SignalStreamError';
	}
}

export class SignalSerializationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SignalSerializationError';
	}
}
