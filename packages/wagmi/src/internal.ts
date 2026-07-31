import { createContext } from 'octane';
import type { ResolvedRegister } from '@wagmi/core';

export const WagmiContext = createContext<ResolvedRegister['config'] | undefined>(undefined);

const slots = new Map<symbol, Map<string, symbol>>();

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (!slot) return undefined;
	let children = slots.get(slot);
	if (!children) {
		children = new Map();
		slots.set(slot, children);
	}
	let child = children.get(tag);
	if (!child) {
		child = Symbol.for(`${slot.description ?? ''}:${tag}`);
		children.set(tag, child);
	}
	return child;
}
