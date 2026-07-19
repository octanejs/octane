// OptionsStore — the single reactive source of truth for scan configuration.
// One responsibility: hold options, merge patches, notify subscribers. Every
// other service and plugin reads options here and reacts to changes; none of
// them own configuration state. Mirrors react-scan's option surface.
import type { InspectionEvent } from '../contract.js';

export type AnimationSpeed = 'slow' | 'fast' | 'off';

export interface Options {
	/** Master switch. `false` pauses the live pipeline (report/overlay). */
	enabled: boolean;
	/** Console-log per-commit render groups. */
	log: boolean;
	/** Mount the toolbar widget. */
	showToolbar: boolean;
	/** Outline flash speed; `off` disables the overlay. */
	animationSpeed: AnimationSpeed;
	/** Accepted for react-scan parity. */
	trackUnnecessaryRenders: boolean;
	onCommitStart?: () => void;
	onCommitFinish?: () => void;
	onRender?: (event: InspectionEvent) => void;
}

export const DEFAULT_OPTIONS: Options = {
	enabled: true,
	log: false,
	showToolbar: true,
	animationSpeed: 'fast',
	trackUnnecessaryRenders: false,
};

export interface OptionsStore {
	get(): Options;
	set(patch: Partial<Options>): void;
	subscribe(listener: () => void): () => void;
}

export function createOptionsStore(): OptionsStore {
	let options: Options = { ...DEFAULT_OPTIONS };
	const listeners = new Set<() => void>();
	return {
		get() {
			return options;
		},
		set(patch) {
			options = { ...options, ...patch };
			for (const listener of listeners) {
				try {
					listener();
				} catch {
					// UI listeners must never break the app being scanned.
				}
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
