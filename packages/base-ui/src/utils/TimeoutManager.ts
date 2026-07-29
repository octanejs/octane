// Ported from .base-ui/packages/react/src/internals/TimeoutManager.ts (v1.6.0). Several keyed
// timeouts behind one handle, so a caller can start/replace/cancel each independently and drop them
// all on teardown. Distinct from `utils/useTimeout`'s `Timeout`, which owns exactly one.
//
// Pure — no renderer API is involved, so this is a straight transcription.
export class TimeoutManager {
	private ids: Map<string, number> = new Map();

	/** Starts `fn` after `delay`, replacing any timeout already running under `key`. */
	start = (key: string, delay: number, fn: () => void): void => {
		this.clear(key);
		const id = setTimeout(() => {
			this.ids.delete(key);
			fn();
		}, delay) as unknown as number;

		this.ids.set(key, id);
	};

	clear = (key: string): void => {
		const id = this.ids.get(key);
		if (id != null) {
			clearTimeout(id);
			this.ids.delete(key);
		}
	};

	clearAll = (): void => {
		this.ids.forEach(clearTimeout);
		this.ids.clear();
	};
}
