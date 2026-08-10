// React-free observable base adapted from react-spring v10.1.2 packages/core/src/FrameValue.ts.
export type ChangeListener<T> = (value: T) => void;

export abstract class FrameValue<T> {
	protected readonly listeners = new Set<ChangeListener<T>>();
	idle = true;
	priority = 0;
	abstract get(): T;
	onChange(listener: ChangeListener<T>): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	protected emitChange(value: T): void {
		for (const listener of this.listeners) listener(value);
	}
}
