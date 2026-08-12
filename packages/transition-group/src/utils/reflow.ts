export function forceReflow(node: Element): number {
	return (node as HTMLElement).scrollTop;
}
