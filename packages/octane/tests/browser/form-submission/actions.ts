export const clicks: string[] = [];
export let hydrated = 0;

export function recordHydrated(): void {
	hydrated++;
}

export function recordClick(event: MouseEvent): void {
	clicks.push((event.target as HTMLElement).id);
}
