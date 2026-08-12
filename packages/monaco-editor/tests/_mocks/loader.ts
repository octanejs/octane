import defaultMonaco, { type Monaco } from './monaco';

let configuredMonaco: Monaco | null = null;
let instance: Monaco | null = null;
let canceled = false;
let holdInit = false;
let pendingResolvers: Array<(value: Monaco) => void> = [];

type Cancelable = Promise<Monaco> & { cancel(): void };

function activeMonaco(): Monaco {
	return configuredMonaco ?? defaultMonaco;
}

function init(): Cancelable {
	canceled = false;
	if (holdInit) {
		const promise = new Promise<Monaco>((resolve, reject) => {
			pendingResolvers.push((value) => {
				if (canceled) {
					const error = new Error('cancelation') as Error & { type?: string };
					error.type = 'cancelation';
					reject(error);
					return;
				}
				instance = value;
				resolve(value);
			});
		}) as Cancelable;
		promise.cancel = () => {
			canceled = true;
		};
		return promise;
	}
	const promise = Promise.resolve().then(() => {
		if (canceled) {
			const error = new Error('cancelation') as Error & { type?: string };
			error.type = 'cancelation';
			throw error;
		}
		instance = activeMonaco();
		return instance;
	}) as Cancelable;
	promise.cancel = () => {
		canceled = true;
	};
	return promise;
}

const loader = {
	init,
	config(options?: { monaco?: Monaco }) {
		if (options?.monaco) {
			configuredMonaco = options.monaco;
			instance = options.monaco;
		}
	},
	__getMonacoInstance(): Monaco | null {
		return instance;
	},
	__reset(options?: { holdInit?: boolean }) {
		instance = null;
		configuredMonaco = null;
		canceled = false;
		holdInit = options?.holdInit === true;
		// Drop without resolve/reject so canceled holdInit promises are not
		// settled into unhandled rejections (useMonaco only attaches .then).
		pendingResolvers = [];
		defaultMonaco.__reset();
	},
	__releaseHeldInit() {
		const monaco = activeMonaco();
		const resolvers = pendingResolvers;
		pendingResolvers = [];
		for (const resolve of resolvers) resolve(monaco);
	},
};

export default loader;
