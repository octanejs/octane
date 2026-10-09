type Component<P> = (props: P) => void;
type Update<T> = (next: T | ((previous: T) => T)) => void;
type Slot = number | symbol;
interface Prototype {
	readonly tag: string;
}

export declare function assertValdiCompilerAbi(version: number): void;
export declare function defineValdiComponent<F extends (...args: any[]) => void>(
	render: F,
	options: { hasHooks: boolean },
): F;
export declare function getValdiComponentConstructor<P>(component: Component<P>): Component<P>;
export declare function hookSlots(count: number): number;
export declare function withSlot<A extends unknown[], R>(
	slot: Slot,
	callback: (...args: A) => R,
	...args: A
): R;
export declare function useState<T>(initial: T | (() => T), slot: Slot): [T, Update<T>, () => T];
export { useState as __useStateWithGetter };

export declare const jsx: {
	makeNodePrototype(tag: string, pairs?: readonly unknown[]): Prototype;
	makeComponentPrototype(pairs?: readonly unknown[]): Prototype;
	beginRender(prototype: Prototype, key?: string): void;
	endRender(): void;
	setAttribute(name: string, value: unknown): void;
	setAttributeString(name: string, value: string | null | undefined): void;
	setAttributeFunction(name: string, value: Function | null | undefined): void;
	beginComponent<P>(component: Component<P>, prototype: Prototype, key?: string): void;
	setViewModelProperty(name: string, value: unknown): void;
	endComponent(): void;
};
