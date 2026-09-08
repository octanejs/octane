export class ScopeDisposedError extends Error {
	constructor(scopeKey: string) {
		super(`Signal scope "${scopeKey}" has been disposed.`);
		this.name = 'ScopeDisposedError';
	}
}

export class SignalWriteError extends Error {
	constructor() {
		super('Signals cannot be changed during a computation, render, or adoption frame.');
		this.name = 'SignalWriteError';
	}
}

export class SignalCycleError extends Error {
	constructor(key: string) {
		super(`Signal "${key}" depends on its own unfinished computation.`);
		this.name = 'SignalCycleError';
	}
}

export class SignalFrameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SignalFrameError';
	}
}

export class SignalSerializationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SignalSerializationError';
	}
}
