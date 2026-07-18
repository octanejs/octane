//#region src/queue.ts
var defaultConfig = {
	concurrency: 5,
	started: false,
	tasks: []
};
var Queue = class {
	onSettles = [];
	onErrors = [];
	onSuccesses = [];
	running;
	active = [];
	pending;
	currentConcurrency;
	constructor(config = defaultConfig) {
		const { concurrency, started, tasks } = {
			...defaultConfig,
			...config
		};
		this.running = started;
		this.pending = tasks;
		this.currentConcurrency = concurrency;
	}
	tick() {
		if (!this.running) return;
		while (this.active.length < this.currentConcurrency && this.pending.length) {
			const nextFn = this.pending.shift();
			if (!nextFn) throw new Error("Found task that is not a function");
			this.active.push(nextFn);
			(async () => {
				let success = false;
				let res;
				let error;
				try {
					res = await nextFn();
					success = true;
				} catch (e) {
					error = e;
				}
				this.active = this.active.filter((d) => d !== nextFn);
				if (success) this.onSuccesses.forEach((d) => d(res, nextFn));
				else this.onErrors.forEach((d) => d(error, nextFn));
				this.onSettles.forEach((d) => d(res, error));
				this.tick();
			})();
		}
	}
	add(fn, { priority } = {}) {
		return new Promise((resolve, reject) => {
			const task = () => Promise.resolve(fn()).then((res) => {
				resolve(res);
				return res;
			}).catch((err) => {
				reject(err);
				throw err;
			});
			if (priority) this.pending.unshift(task);
			else this.pending.push(task);
			this.tick();
		});
	}
	throttle(n) {
		this.currentConcurrency = n;
	}
	onSettled(cb) {
		this.onSettles.push(cb);
		return () => {
			this.onSettles = this.onSettles.filter((d) => d !== cb);
		};
	}
	onError(cb) {
		this.onErrors.push(cb);
		return () => {
			this.onErrors = this.onErrors.filter((d) => d !== cb);
		};
	}
	onSuccess(cb) {
		this.onSuccesses.push(cb);
		return () => {
			this.onSuccesses = this.onSuccesses.filter((d) => d !== cb);
		};
	}
	stop() {
		this.running = false;
	}
	start() {
		this.running = true;
		this.tick();
		return new Promise((resolve) => {
			this.onSettled(() => {
				if (this.isSettled()) resolve();
			});
		});
	}
	clear() {
		this.pending = [];
	}
	getActive() {
		return this.active;
	}
	getPending() {
		return this.pending;
	}
	getAll() {
		return [...this.active, ...this.pending];
	}
	isRunning() {
		return this.running;
	}
	isSettled() {
		return !this.active.length && !this.pending.length;
	}
};
//#endregion
export { Queue };

//# sourceMappingURL=queue.js.map