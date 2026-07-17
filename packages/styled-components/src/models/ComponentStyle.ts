import { SC_VERSION } from '../constants';
import StyleSheet from '../sheet';
import type { AnyComponent } from '../types';
import { ExecutionContext, RuleSet, Stringifier } from '../types';
import flatten from '../utils/flatten';
import generateName from '../utils/generateAlphabeticName';
import getComponentName from '../utils/getComponentName';
import { LIMIT as TOO_MANY_CLASSES_LIMIT } from '../utils/createWarnTooManyClasses';
import { hash, phash } from '../utils/hash';
import isKeyframes from '../utils/isKeyframes';
import isPlainObject from '../utils/isPlainObject';
import isStatelessFunction from '../utils/isStatelessFunction';
import isStyledComponent from '../utils/isStyledComponent';
import { joinStringArray, joinStrings } from '../utils/joinStrings';

const SEED = hash(SC_VERSION);

/**
 * Upper bound on dynamicNameCache entries per ComponentStyle instance.
 * Without this cap, components with free-form string interpolations
 * (e.g. `color: ${p => p.$color}` where $color is unbounded user input)
 * leak memory for the lifetime of the component definition. Aligned to
 * the warnTooManyClasses dev threshold so the warning and the eviction
 * share a single source of truth: by the time you start dropping cache
 * entries, the dev warning has already told you why.
 */
const MAX_DYNAMIC_NAME_CACHE = TOO_MANY_CLASSES_LIMIT;

/**
 * ComponentStyle is all the CSS-specific stuff, not the framework-specific stuff.
 */
export default class ComponentStyle {
	baseHash: number;
	baseStyle: ComponentStyle | null | undefined;
	componentId: string;
	rules: RuleSet<any>;
	dynamicNameCache: Map<string, string> | undefined;
	/**
	 * Octane addition: content-addressed cache of compiled stylis output. The
	 * phantom server sheet never retains names (each request must re-emit its
	 * chunks), so without this every server render would re-run stylis for the
	 * same css. Keyed identically to dynamicNameCache (stylis hash + raw css),
	 * so entries are immutable and safe to share across requests.
	 */
	compiledRulesCache: Map<string, string[]> | undefined;

	constructor(rules: RuleSet<any>, componentId: string, baseStyle?: ComponentStyle | undefined) {
		this.rules = rules;
		this.componentId = componentId;
		this.baseHash = phash(SEED, componentId);
		this.baseStyle = baseStyle;

		// NOTE: This registers the componentId, which ensures a consistent order
		// for this component's styles compared to others
		StyleSheet.registerId(componentId);
	}

	generateAndInjectStyles(
		executionContext: ExecutionContext,
		styleSheet: StyleSheet,
		stylis: Stringifier,
	): string {
		let names = this.baseStyle
			? this.baseStyle.generateAndInjectStyles(executionContext, styleSheet, stylis)
			: '';

		{
			let css = '';

			for (let i = 0; i < this.rules.length; i++) {
				const partRule = this.rules[i];

				if (typeof partRule === 'string') {
					css += partRule;
				} else if (partRule) {
					// Fast path: inline function call for the common case (interpolation
					// returning a string). Avoids flatten's type dispatch and array alloc.
					// OCTANE: styled components are plain functions — exclude them here
					// (flatten resolves them to their class selector) so a component is
					// never invoked as a style function.
					if (isStatelessFunction(partRule) && !isStyledComponent(partRule)) {
						const fnResult = partRule(executionContext);
						if (typeof fnResult === 'string') {
							css += fnResult;
						} else if (fnResult !== undefined && fnResult !== null && fnResult !== false) {
							if (
								process.env.NODE_ENV !== 'production' &&
								typeof fnResult === 'object' &&
								!Array.isArray(fnResult) &&
								!isKeyframes(fnResult) &&
								!isPlainObject(fnResult)
							) {
								console.error(
									`${getComponentName(
										partRule as AnyComponent,
									)} is not a styled component and cannot be referred to via component selector. See https://styled-components.com/docs/advanced#referring-to-other-components for more details.`,
								);
							}

							css += joinStringArray(
								flatten(fnResult, executionContext, styleSheet, stylis) as string[],
							);
						}
					} else {
						css += joinStringArray(
							flatten(partRule, executionContext, styleSheet, stylis) as string[],
						);
					}
				}
			}

			if (css) {
				// Cache css->name to skip phash+generateName for repeat CSS strings.
				// The CSS string fully determines the class name for a given component,
				// so a Map lookup replaces O(cssLen) hashing on cache hit.
				if (!this.dynamicNameCache) this.dynamicNameCache = new Map();
				const cacheKey = stylis.hash ? stylis.hash + css : css;
				let name = this.dynamicNameCache.get(cacheKey);
				if (!name) {
					name = generateName(phash(phash(this.baseHash, stylis.hash), css) >>> 0);
					if (this.dynamicNameCache.size >= MAX_DYNAMIC_NAME_CACHE) {
						const oldest = this.dynamicNameCache.keys().next().value;
						if (oldest !== undefined) this.dynamicNameCache.delete(oldest);
					}
					this.dynamicNameCache.set(cacheKey, name);
				}

				if (!styleSheet.hasNameForId(this.componentId, name)) {
					let cssFormatted = this.compiledRulesCache?.get(cacheKey);
					if (!cssFormatted) {
						cssFormatted = stylis(css, '.' + name, undefined, this.componentId);
						if (!this.compiledRulesCache) this.compiledRulesCache = new Map();
						if (this.compiledRulesCache.size >= MAX_DYNAMIC_NAME_CACHE) {
							const oldest = this.compiledRulesCache.keys().next().value;
							if (oldest !== undefined) this.compiledRulesCache.delete(oldest);
						}
						this.compiledRulesCache.set(cacheKey, cssFormatted);
					}
					styleSheet.insertRules(this.componentId, name, cssFormatted);
				}

				names = joinStrings(names, name);
			}
		}

		return names;
	}
}
