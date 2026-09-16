export interface PrimaryActionSnapshot {
	readonly type: 'submit' | 'button';
	readonly disabled: boolean;
	readonly visuallyDisabled: boolean;
	readonly stopRequested: boolean;
	readonly active: boolean;
	readonly label: string;
	readonly tone: string;
}

export const initialPrimaryAction: PrimaryActionSnapshot = {
	type: 'submit',
	disabled: false,
	visuallyDisabled: false,
	stopRequested: false,
	active: false,
	label: 'Send message',
	tone: 'black',
};

export interface PrimaryActionSource {
	getSnapshot(): PrimaryActionSnapshot;
	subscribe(notify: () => void): () => void;
}

// Both implementations consume the same application-owned synchronous source.
// The benchmark does not replace document signals, draft ownership, or streaming.
export function createPrimaryActionSource() {
	let snapshot = initialPrimaryAction;
	const subscribers = new Set<() => void>();
	return {
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			subscribers.add(notify);
			return () => subscribers.delete(notify);
		},
		publish(next: PrimaryActionSnapshot, notify = true) {
			snapshot = next;
			if (notify) for (const subscriber of subscribers) subscriber();
		},
	};
}
