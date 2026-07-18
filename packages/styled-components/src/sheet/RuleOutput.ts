import { GroupedTag, RuleOutput, SheetOptions } from './types';
import { makeGroupedTag } from './GroupedTag';
import { makeTag, VirtualTag } from './Tag';
import { emitChunk } from './octaneChannel';

/** A persistent grouped rule destination (browser DOM or virtual server tag). */
class GroupedRuleOutput implements RuleOutput {
	readonly persistent = true;
	private tag: GroupedTag | undefined;

	constructor(private readonly options: SheetOptions) {}

	getTag() {
		return this.tag || (this.tag = makeGroupedTag(makeTag(this.options)));
	}

	insertRules(_id: string, _name: string, group: number, rules: string[]): void {
		this.getTag().insertRules(group, rules);
	}

	clearGroup(group: number): void {
		this.getTag().clearGroup(group);
	}

	reset(): void {
		this.tag = undefined;
	}
}

/**
 * The default server destination is deliberately stateless. Octane's active
 * render owns collection and deduplication, so module state cannot cross a
 * request boundary.
 */
class OctaneChannelRuleOutput implements RuleOutput {
	readonly persistent = false;
	private inspectionTag: GroupedTag | undefined;

	getTag() {
		return this.inspectionTag || (this.inspectionTag = makeGroupedTag(new VirtualTag()));
	}

	insertRules(id: string, name: string, _group: number, rules: string[]): void {
		emitChunk(id, name, rules);
	}

	clearGroup(_group: number): void {}

	reset(): void {
		this.inspectionTag = undefined;
	}
}

/** Server compatibility output: emit automatically and retain for serialization. */
class CapturingServerRuleOutput extends GroupedRuleOutput {
	insertRules(id: string, name: string, group: number, rules: string[]): void {
		emitChunk(id, name, rules);
		super.insertRules(id, name, group, rules);
	}
}

export function createRuleOutput(options: SheetOptions): RuleOutput {
	if (!options.isServer) return new GroupedRuleOutput(options);
	if (options.capture) return new CapturingServerRuleOutput(options);
	return new OctaneChannelRuleOutput();
}
