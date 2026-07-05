// Ported from .base-ui/packages/utils/src/useTimeout.ts. A `setTimeout` with automatic
// cleanup on unmount. `useOnMount` → an octane effect with empty deps whose cleanup runs on
// unmount.
//
// SLOT: `useTimeout` is a plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useRefWithInit } from './useRefWithInit';

const EMPTY = 0;

export class Timeout {
	static create(): Timeout {
		return new Timeout();
	}

	currentId: number = EMPTY;

	/** Executes `fn` after `delay`, clearing any previously scheduled call. */
	start(delay: number, fn: Function): void {
		this.clear();
		this.currentId = setTimeout(() => {
			this.currentId = EMPTY;
			fn();
		}, delay) as unknown as number;
	}

	isStarted(): boolean {
		return this.currentId !== EMPTY;
	}

	clear = (): void => {
		if (this.currentId !== EMPTY) {
			clearTimeout(this.currentId);
			this.currentId = EMPTY;
		}
	};

	disposeEffect = (): (() => void) => {
		return this.clear;
	};
}

export function useTimeout(...args: any[]): Timeout {
	const [, slotArg] = splitSlot(['_', ...args]);
	const slot = slotArg ?? S('useTimeout');
	const timeout = useRefWithInit<Timeout>(Timeout.create, subSlot(slot, 'to')).current;
	useEffect(timeout.disposeEffect, [], subSlot(slot, 'e:mount'));
	return timeout;
}
