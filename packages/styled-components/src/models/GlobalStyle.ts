import StyleSheet from '../sheet';
import { ExecutionContext, RuleSet, Stringifier } from '../types';
import flatten from '../utils/flatten';
import generateName from '../utils/generateAlphabeticName';
import { hash } from '../utils/hash';
import isStaticRules from '../utils/isStaticRules';
import { joinRules, joinStringArray } from '../utils/joinStrings';

type InstanceEntry = { name: string; rules: string[] };

export default class GlobalStyle<Props extends object> {
	componentId: string;
	isStatic: boolean;
	rules: RuleSet<Props>;

	/** @internal Per-instance rule cache for shared-group rebuild. */
	instanceRules: Map<number, InstanceEntry> = new Map();

	constructor(rules: RuleSet<Props>, componentId: string) {
		this.rules = rules;
		this.componentId = componentId;
		this.isStatic = isStaticRules(rules);

		// Pre-register the shared group so global styles defined before
		// components always appear before them in the stylesheet.
		StyleSheet.registerId(this.componentId);
	}

	removeStyles(instance: number, styleSheet: StyleSheet): void {
		this.instanceRules.delete(instance);
		this.rebuildGroup(styleSheet);
	}

	/**
	 * Server rendering is content-addressed and has no component-instance
	 * lifecycle. The output backend decides whether to retain a compatibility
	 * copy; the default Octane backend writes only to the active request.
	 */
	renderServerStyles(
		executionContext: ExecutionContext & Props,
		styleSheet: StyleSheet,
		stylis: Stringifier,
	): void {
		const rules = this.compileRules(executionContext, styleSheet, stylis);
		const name = this.componentId + '-' + generateName(hash(joinRules(rules)) >>> 0);

		if (!styleSheet.hasNameForId(this.componentId, name)) {
			styleSheet.insertRules(this.componentId, name, rules);
		}
	}

	renderStyles(
		instance: number,
		executionContext: ExecutionContext & Props,
		styleSheet: StyleSheet,
		stylis: Stringifier,
	): void {
		const id = this.componentId;

		if (this.isStatic) {
			// The component/instance name is the client dedup key, so compute it
			// before checking the persistent output.
			const entry =
				this.instanceRules.get(instance) ??
				this.computeRules(instance, executionContext, styleSheet, stylis);
			if (!styleSheet.hasNameForId(id, entry.name)) {
				styleSheet.insertRules(id, entry.name, entry.rules);
			}
			return;
		}

		// Compute new rules; skip the client CSSOM rebuild if CSS is unchanged.
		const prev = this.instanceRules.get(instance);
		this.computeRules(instance, executionContext, styleSheet, stylis);
		if (prev) {
			const a = prev.rules;
			const b = this.instanceRules.get(instance)!.rules;
			if (a.length === b.length) {
				let same = true;
				for (let i = 0; i < a.length; i++) {
					if (a[i] !== b[i]) {
						same = false;
						break;
					}
				}
				if (same) return;
			}
		}
		this.rebuildGroup(styleSheet);
	}

	private computeRules(
		instance: number,
		executionContext: ExecutionContext & Props,
		styleSheet: StyleSheet,
		stylis: Stringifier,
	): InstanceEntry {
		const rules = this.compileRules(executionContext, styleSheet, stylis);
		const entry: InstanceEntry = {
			name: this.componentId + instance,
			rules,
		};
		this.instanceRules.set(instance, entry);
		return entry;
	}

	private compileRules(
		executionContext: ExecutionContext & Props,
		styleSheet: StyleSheet,
		stylis: Stringifier,
	): string[] {
		const flatCSS = joinStringArray(
			flatten(this.rules as RuleSet<object>, executionContext, styleSheet, stylis) as string[],
		);
		return stylis(flatCSS, '');
	}

	/**
	 * Clear all CSS rules in the shared group and re-insert from surviving instances.
	 * Must run synchronously - no yielding between clear and re-insert.
	 */
	private rebuildGroup(styleSheet: StyleSheet): void {
		const id = this.componentId;
		styleSheet.clearRules(id);
		for (const entry of this.instanceRules.values()) {
			styleSheet.insertRules(id, entry.name, entry.rules);
		}
	}
}
