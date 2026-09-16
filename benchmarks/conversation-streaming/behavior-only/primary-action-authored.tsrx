import { adoptBindings } from 'octane/behavior';
import { PrimaryAction } from './PrimaryAction.tsrx';
import type { PrimaryActionSource } from './primary-action-state.ts';

export function attachPrimaryAction(
	root: Element,
	source: PrimaryActionSource,
	signal: AbortSignal,
) {
	return adoptBindings(root, PrimaryAction, source, { signal });
}
