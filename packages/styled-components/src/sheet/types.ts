import type { InsertionTarget } from '../types';

/** CSSStyleSheet-like Tag abstraction for CSS rules */
export interface Tag {
	insertRule(index: number, rule: string): boolean;
	deleteRule(index: number): void;
	getRule(index: number): string;
	length: number;
}

/** Group-aware Tag that sorts rules by indices */
export interface GroupedTag {
	clearGroup(group: number): void;
	getGroup(group: number): string;
	groupSizes: Uint32Array;
	insertRules(group: number, rules: string[]): void;
	length: number;
	tag: Tag;
}

export type SheetOptions = {
	isServer: boolean;
	nonce?: string | undefined;
	target?: InsertionTarget | undefined;
	useCSSOMInjection: boolean;
	/** Retain a server copy for the `ServerStyleSheet` compatibility API. */
	capture?: boolean;
};

/**
 * Destination for compiled rules. The sheet owns names and component order;
 * an output owns only where rules go and whether they survive an insertion.
 */
export interface RuleOutput {
	readonly persistent: boolean;
	clearGroup(group: number): void;
	getTag(): GroupedTag;
	insertRules(id: string, name: string, group: number, rules: string[]): void;
	reset(): void;
}

export interface Sheet {
	allocateGSInstance(id: string): number;
	clearNames(id: string): void;
	clearRules(id: string): void;
	clearTag(): void;
	getTag(): GroupedTag;
	hasNameForId(id: string, name: string): boolean;
	insertRules(id: string, name: string, rules: string[]): void;
	options: SheetOptions;
	names: Map<string, Set<string>>;
	registerName(id: string, name: string): void;
	rehydrate(): void;
	server: boolean;
	toString(): string;
}
