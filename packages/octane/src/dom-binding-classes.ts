import { normalizeClass } from './class-names.js';

/** Class membership owned by one compiler-authored host and its class groups. */
interface ClassReceipt {
	name: string;
	baseline: string;
	values: string[];
	counts: Map<string, number>;
	active: Set<number>;
}

export interface BindingClassGroup {
	/** Preparation can be discarded without changing the DOM or its receipts. */
	prepare(value: string): { commit(): void };
	/** An uncommitted adoption leaves the historical SSR contribution intact. */
	dispose(preservePresentation?: boolean): void;
}

const receipts = /* @__PURE__ */ new WeakMap<Element, ClassReceipt>();

function tokens(value: string): Set<string> {
	return new Set(value.match(/[^\t\n\f\r ]+/g));
}

export function __bindingClassReceipt(baseline: unknown, groups: readonly unknown[]): string {
	return JSON.stringify([normalizeClass(baseline), groups.map(normalizeClass)]);
}

function readReceipt(node: Element, name: string, initialReceipt?: string): ClassReceipt {
	let value: unknown;
	try {
		value = JSON.parse(initialReceipt ?? node.getAttribute(name) ?? 'null');
	} catch {
		throw new Error('DOM class groups require a valid compiler-issued class receipt.');
	}
	if (
		!name.startsWith('data-octane-class-') ||
		!Array.isArray(value) ||
		value.length !== 2 ||
		typeof value[0] !== 'string' ||
		!Array.isArray(value[1]) ||
		value[1].some((group: unknown) => typeof group !== 'string')
	)
		throw new Error('DOM class groups require a valid compiler-issued class receipt.');
	const counts = new Map<string, number>();
	for (const contribution of [value[0], ...value[1]])
		for (const token of tokens(contribution)) counts.set(token, (counts.get(token) ?? 0) + 1);
	return { name, baseline: value[0], values: value[1], counts, active: new Set() };
}

/**
 * Adopt the server's historical contribution, not a possibly newer client value.
 * Baseline and sibling groups each retain their own contribution to shared atoms.
 * The surrounding binding runtime owns channel exclusion and subscription lifetime.
 */
export function createBindingClassGroup(
	node: Element,
	name: string,
	index: number,
	initialReceipt?: string,
): BindingClassGroup {
	let receipt = receipts.get(node);
	if (receipt !== undefined && receipt.name !== name)
		throw new Error('A DOM host cannot mix class groups from different binding views.');
	receipt ??= readReceipt(node, name, initialReceipt);
	if (!Number.isInteger(index) || index < 0 || index >= receipt.values.length)
		throw new Error('A DOM class group does not match its compiler-issued receipt.');
	if (receipt.active.has(index)) throw new Error('This DOM class group already has a binding.');
	receipt.active.add(index);
	receipts.set(node, receipt);
	let disposed = false;
	let committed = false;
	let revision = 0;
	let retiring = new Set<string>();
	const state = receipt;

	function publish(value: string, next: Set<string>): void {
		const old = tokens(state.values[index]!);
		const remove: string[] = [];
		const add: string[] = [];
		for (const token of old) {
			if (next.has(token)) continue;
			const count = state.counts.get(token)! - 1;
			if (count === 0) {
				state.counts.delete(token);
				remove.push(token);
			} else state.counts.set(token, count);
		}
		for (const token of next) {
			if (old.has(token)) continue;
			const count = state.counts.get(token) ?? 0;
			state.counts.set(token, count + 1);
			if (count === 0) add.push(token);
		}
		// Publish ownership before native writes: a synchronous attribute reaction
		// may dispose this group, and its cleanup must see the new contribution.
		state.values[index] = value;
		revision++;
		retiring = new Set(remove);
		for (const token of remove) {
			node.classList.remove(token);
			retiring.delete(token);
			if (disposed) return;
		}
		for (const token of add) {
			node.classList.add(token);
			if (disposed) return;
		}
		node.setAttribute(name, JSON.stringify([state.baseline, state.values]));
	}

	return {
		prepare(value) {
			if (disposed) throw new Error('Cannot prepare a disposed DOM class group.');
			const preparedAt = revision;
			const next = value === state.values[index] ? null : tokens(value);
			return {
				commit() {
					if (disposed) return;
					if (preparedAt !== revision)
						throw new Error('Cannot commit an outdated DOM class group preparation.');
					committed = true;
					if (next !== null) publish(value, next);
				},
			};
		},
		dispose(preservePresentation) {
			if (disposed) return;
			// Cleanup owns the writes below even though the live group is now closed.
			disposed = true;
			if (!committed || preservePresentation) {
				state.active.delete(index);
				if (state.active.size === 0) receipts.delete(node);
				return;
			}
			const old = tokens(state.values[index]!);
			state.values[index] = '';
			revision++;
			const remove = new Set<string>();
			for (const token of old) {
				const count = state.counts.get(token)! - 1;
				if (count === 0) {
					state.counts.delete(token);
					remove.add(token);
				} else state.counts.set(token, count);
			}
			// A reaction can dispose midway through removing the previous group.
			// Its remaining retired tokens no longer occur in values[index].
			for (const token of retiring) if (!state.counts.has(token)) remove.add(token);
			retiring.clear();
			let failed = false;
			let failure: unknown;
			const attempt = (write: () => void): void => {
				try {
					write();
				} catch (error) {
					if (!failed) {
						failed = true;
						failure = error;
					}
				}
			};
			for (const token of remove) attempt(() => node.classList.remove(token));
			attempt(() => node.setAttribute(name, JSON.stringify([state.baseline, state.values])));
			state.active.delete(index);
			if (state.active.size === 0) receipts.delete(node);
			if (failed) throw failure;
		},
	};
}
