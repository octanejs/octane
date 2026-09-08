export function getStorageKey(id: string, panelIds: readonly string[]): string {
	return `react-resizable-panels:${[id, ...panelIds].join(':')}`;
}
