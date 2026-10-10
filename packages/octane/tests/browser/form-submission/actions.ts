export const clicks: string[] = [];
export let hydrated = 0;
export const editorEvents: Array<{
	type: string;
	trusted: boolean;
	data: string | null;
	composing: boolean | null;
}> = [];
export const activations: Array<{ trusted: boolean; active: boolean }> = [];
export function recordEditor(event: Event): void {
	editorEvents.push({
		type: event.type,
		trusted: event.isTrusted,
		data: 'data' in event ? (event as InputEvent).data : null,
		composing: 'isComposing' in event ? (event as InputEvent).isComposing : null,
	});
}

export function recordHydrated(): void {
	hydrated++;
}

export function recordClick(event: MouseEvent): void {
	clicks.push((event.target as HTMLElement).id);
	activations.push({ trusted: event.isTrusted, active: navigator.userActivation.isActive });
}
