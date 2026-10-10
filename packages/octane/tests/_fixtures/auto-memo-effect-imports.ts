export type EffectRowRef = (element: Element | null) => void | (() => void);

export let effectRowRef: EffectRowRef = () => {};
export let effectRowNumber = 0;

export function setEffectRowImports(ref: EffectRowRef, value: number): void {
	effectRowRef = ref;
	effectRowNumber = value;
}
