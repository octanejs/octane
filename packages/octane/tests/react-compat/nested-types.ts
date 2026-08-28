export interface NestedProps {
	label: string;
	strict: boolean;
	bus: EventTarget;
	onSignal: (owner: 'octane' | 'react', label: string) => void;
	octaneRef: { current: HTMLButtonElement | null };
	reactRef: { current: HTMLButtonElement | null };
}
