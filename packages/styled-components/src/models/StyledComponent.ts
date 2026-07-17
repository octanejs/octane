// Ported from styled-components 6.4.3 (MIT), adapted for octane:
// - No forwardRef: the generated component is a plain octane function
//   component and `ref` arrives as an ordinary prop, which is always forwarded
//   to the created element (octane attaches refs from props natively).
// - No RSC/`__SERVER__` build flags: the render cache is skipped on the server
//   at runtime, matching the upstream server behavior.
// - `defaultProps` is resolved by this factory at render time (octane's
//   compiled call sites do not apply component defaultProps).
import isPropValid from '@emotion/is-prop-valid';
import { createElement, useContext, useRef } from 'octane';

import { IS_BROWSER } from '../constants';
import type StyleSheet from '../sheet';
import type {
	AnyComponent,
	Attrs,
	BaseObject,
	Dict,
	ExecutionContext,
	ExecutionProps,
	IStyledComponent,
	IStyledComponentFactory,
	IStyledStatics,
	OmitNever,
	RuleSet,
	Stringifier,
	StyledOptions,
	WebTarget,
} from '../types';
import { checkDynamicCreation } from '../utils/checkDynamicCreation';
import createWarnTooManyClasses from '../utils/createWarnTooManyClasses';
import determineTheme from '../utils/determineTheme';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../utils/empties';
import escape from '../utils/escape';
import generateComponentId from '../utils/generateComponentId';
import generateDisplayName from '../utils/generateDisplayName';
import hoist from '../utils/hoist';
import isFunction from '../utils/isFunction';
import isStyledComponent, { STYLED_COMPONENT_BRAND } from '../utils/isStyledComponent';
import isTag from '../utils/isTag';
import { joinStrings } from '../utils/joinStrings';
import merge from '../utils/mixinDeep';
import { setToString } from '../utils/setToString';
import { SC_VERSION } from '../constants';
import ComponentStyle from './ComponentStyle';
import { useStyleSheetContext } from './StyleSheetManager';
import { DefaultTheme, ThemeContext } from './ThemeProvider';

const hasOwn = Object.prototype.hasOwnProperty;

const SLOT_STYLE_MEMO = Symbol.for('@octanejs/styled-components:style-memo');

const identifiers: { [key: string]: number } = {};

/** Test-only: clear the per-displayName counter so component IDs stay stable
 *  across tests. Not for production use. */
export const resetIdentifiers = (): void => {
	for (const k in identifiers) delete identifiers[k];
};

/* We depend on components having unique IDs */
function generateId(
	displayName?: string | undefined,
	parentComponentId?: string | undefined,
): string {
	const name = typeof displayName !== 'string' ? 'sc' : escape(displayName);
	// Ensure that no displayName can lead to duplicate componentIds
	identifiers[name] = (identifiers[name] || 0) + 1;

	const componentId =
		name +
		'-' +
		generateComponentId(
			// SC_VERSION gives us isolation between multiple runtimes on the page at once
			SC_VERSION + name + identifiers[name],
		);

	return parentComponentId ? parentComponentId + '-' + componentId : componentId;
}

/**
 * Shallow-compare two context objects using a stored key count to avoid
 * a second iteration pass. Returns true if all own-property values match.
 */
function shallowEqualContext(prev: object, next: object, prevKeyCount: number): boolean {
	const a = prev as Record<string, unknown>;
	const b = next as Record<string, unknown>;
	let nextKeyCount = 0;
	for (const key in b) {
		if (hasOwn.call(b, key)) {
			nextKeyCount++;
			if (a[key] !== b[key]) return false;
		}
	}
	return nextKeyCount === prevKeyCount;
}

// Cached render inputs + style result: [prevProps, prevTheme, prevStyleSheet, prevStylis,
// prevPropsKeyCount, cachedContext, cachedClassName, prevComponentStyle]
type RenderCache = [
	object, // prevProps
	DefaultTheme | undefined, // prevTheme
	StyleSheet, // prevStyleSheet
	Stringifier, // prevStylis
	number, // prevPropsKeyCount
	object, // cachedContext
	string, // cachedClassName
	ComponentStyle, // prevComponentStyle (for HMR invalidation)
];

type StyleContext<Props extends BaseObject> = ExecutionContext &
	Props & {
		className?: string | undefined;
		style?: Dict<any> | undefined;
		[key: string]: any;
	};

function resolveContext<Props extends BaseObject>(
	attrs: Attrs<Props>[],
	props: ExecutionProps & Props,
	theme: DefaultTheme | undefined,
): StyleContext<Props> {
	const context: StyleContext<Props> = {
		...props,
		// unset, add `props.className` back at the end so props always "wins"
		className: undefined,
		theme,
	} as StyleContext<Props>;

	const needsCopy = attrs.length > 1;
	for (let i = 0; i < attrs.length; i++) {
		const attrDef = attrs[i];
		const resolvedAttrDef = isFunction(attrDef)
			? (attrDef as Function)(needsCopy ? { ...context } : context)
			: attrDef;

		for (const key in resolvedAttrDef) {
			if (key === 'className') {
				context.className = joinStrings(context.className, resolvedAttrDef[key] as string);
			} else if (key === 'style') {
				context.style = { ...context.style, ...(resolvedAttrDef[key] as Dict<any>) };
			} else if (!(key in props && (props as any)[key] === undefined)) {
				// Apply attr value unless the user explicitly passed undefined for this prop,
				// which signals intent to reset the value.
				(context as any)[key] = resolvedAttrDef[key];
			}
		}
	}

	if ('className' in props && typeof (props as any).className === 'string') {
		context.className = joinStrings(context.className, (props as any).className);
	}

	return context;
}

let seenUnknownProps: Set<string> | undefined;

function buildPropsForElement(
	context: Record<string, any>,
	elementToBeCreated: WebTarget,
	theme: DefaultTheme | undefined,
	shouldForwardProp: ((prop: string, el: WebTarget) => boolean) | undefined,
): Dict<any> {
	const propsForElement: Dict<any> = {};

	for (const key in context) {
		if (context[key] === undefined) {
			// Omit undefined values from props passed to wrapped element.
		} else if (key[0] === '$' || key === 'as' || (key === 'theme' && context.theme === theme)) {
			// Omit transient props and execution props.
		} else if (key === 'forwardedAs') {
			propsForElement.as = context.forwardedAs;
		} else if (key === 'ref') {
			// octane refs are plain props; a ref always attaches to the created
			// element and is never subject to shouldForwardProp filtering.
			propsForElement.ref = context.ref;
		} else if (!shouldForwardProp || shouldForwardProp(key, elementToBeCreated)) {
			propsForElement[key] = context[key];

			if (
				!shouldForwardProp &&
				process.env.NODE_ENV === 'development' &&
				!isPropValid(key) &&
				!(seenUnknownProps || (seenUnknownProps = new Set())).has(key) &&
				isTag(elementToBeCreated) &&
				!elementToBeCreated.includes('-')
			) {
				seenUnknownProps.add(key);
				console.warn(
					`styled-components: it looks like an unknown prop "${key}" is being sent through to the DOM, which will likely trigger a console error. If you would like automatic filtering of unknown props, you can opt-into that behavior via \`<StyleSheetManager shouldForwardProp={...}>\` (connect an API like \`@emotion/is-prop-valid\`) or consider using transient props (\`$\` prefix for automatic filtering.)`,
				);
			}
		}
	}

	return propsForElement;
}

function useStyledComponentImpl<Props extends BaseObject>(
	forwardedComponent: IStyledComponent<'web', Props>,
	props: ExecutionProps & Props,
) {
	const {
		attrs: componentAttrs,
		componentStyle,
		defaultProps,
		foldedComponentIds,
		styledComponentId,
		target,
	} = forwardedComponent;

	const contextTheme = useContext(ThemeContext);
	const ssc = useStyleSheetContext();
	const shouldForwardProp = forwardedComponent.shouldForwardProp || ssc.shouldForwardProp;

	const theme = determineTheme(props, contextTheme, defaultProps) || EMPTY_OBJECT;

	let context: StyleContext<Props>;
	let generatedClassName: string;

	// Client-only render cache: skip resolveContext and generateAndInjectStyles
	// when props+theme haven't changed. propsForElement is always rebuilt since
	// it's mutated with className/ref after construction. Conditional hooks are
	// legal in octane (slot-keyed), so the server path simply never allocates
	// the cache cell.
	if (IS_BROWSER) {
		const renderCacheRef = useRef<RenderCache | null>(null, SLOT_STYLE_MEMO);
		const prev = renderCacheRef.current;

		if (
			prev !== null &&
			prev[1] === theme &&
			prev[2] === ssc.styleSheet &&
			prev[3] === ssc.stylis &&
			prev[7] === componentStyle &&
			shallowEqualContext(prev[0], props, prev[4])
		) {
			context = prev[5] as StyleContext<Props>;
			generatedClassName = prev[6];
		} else {
			context = resolveContext<Props>(componentAttrs, props, theme);
			generatedClassName = componentStyle.generateAndInjectStyles(
				context,
				ssc.styleSheet,
				ssc.stylis,
			);

			let propsKeyCount = 0;
			for (const key in props) {
				if (hasOwn.call(props, key)) propsKeyCount++;
			}
			renderCacheRef.current = [
				props,
				theme,
				ssc.styleSheet,
				ssc.stylis,
				propsKeyCount,
				context,
				generatedClassName,
				componentStyle,
			];
		}
	} else {
		context = resolveContext<Props>(componentAttrs, props, theme);
		generatedClassName = componentStyle.generateAndInjectStyles(
			context,
			ssc.styleSheet,
			ssc.stylis,
		);
	}

	if (process.env.NODE_ENV !== 'production' && forwardedComponent.warnTooManyClasses) {
		forwardedComponent.warnTooManyClasses(generatedClassName);
	}

	const elementToBeCreated: WebTarget = (context.as as WebTarget) || target;
	const propsForElement = buildPropsForElement(
		context,
		elementToBeCreated,
		theme,
		shouldForwardProp,
	);

	let classString = joinStrings(foldedComponentIds, styledComponentId);
	if (generatedClassName) {
		classString += ' ' + generatedClassName;
	}
	if (context.className) {
		classString += ' ' + context.className;
	}

	propsForElement[
		isTag(elementToBeCreated) && elementToBeCreated.includes('-') ? 'class' : 'className'
	] = classString;

	return createElement(elementToBeCreated as any, propsForElement);
}

function createStyledComponent<
	Target extends WebTarget,
	OuterProps extends BaseObject,
	Statics extends BaseObject = BaseObject,
>(
	target: Target,
	options: StyledOptions<'web', OuterProps>,
	rules: RuleSet<OuterProps>,
): ReturnType<IStyledComponentFactory<'web', Target, OuterProps, Statics>> {
	const isTargetStyledComp = isStyledComponent(target);
	const styledComponentTarget = target as IStyledComponent<'web', OuterProps>;
	const isCompositeComponent = !isTag(target);

	const {
		attrs = EMPTY_ARRAY,
		componentId = generateId(options.displayName, options.parentComponentId),
		displayName = generateDisplayName(target),
	} = options;

	const styledComponentId =
		options.displayName && options.componentId
			? escape(options.displayName) + '-' + options.componentId
			: options.componentId || componentId;

	// fold the underlying StyledComponent attrs up (implicit extend)
	const finalAttrs =
		isTargetStyledComp && styledComponentTarget.attrs
			? styledComponentTarget.attrs.concat(attrs as unknown as Attrs<OuterProps>[]).filter(Boolean)
			: (attrs as Attrs<OuterProps>[]);

	let { shouldForwardProp } = options;

	if (isTargetStyledComp && styledComponentTarget.shouldForwardProp) {
		const shouldForwardPropFn = styledComponentTarget.shouldForwardProp;

		if (options.shouldForwardProp) {
			const passedShouldForwardPropFn = options.shouldForwardProp;

			// compose nested shouldForwardProp calls
			shouldForwardProp = (prop, elementToBeCreated) =>
				shouldForwardPropFn(prop, elementToBeCreated) &&
				passedShouldForwardPropFn(prop, elementToBeCreated);
		} else {
			shouldForwardProp = shouldForwardPropFn;
		}
	}

	const componentStyle = new ComponentStyle(
		rules,
		styledComponentId,
		isTargetStyledComp ? (styledComponentTarget.componentStyle as ComponentStyle) : undefined,
	);

	function StyledComponentRender(props: ExecutionProps & OuterProps, _scope?: any) {
		return useStyledComponentImpl<OuterProps>(
			WrappedStyledComponent,
			props as ExecutionProps & OuterProps,
		);
	}

	StyledComponentRender.displayName = displayName;

	let WrappedStyledComponent = StyledComponentRender as unknown as IStyledComponent<'web', any> &
		Statics;
	(WrappedStyledComponent as any)[STYLED_COMPONENT_BRAND] = true;
	WrappedStyledComponent.attrs = finalAttrs;
	WrappedStyledComponent.componentStyle = componentStyle;
	WrappedStyledComponent.displayName = displayName;
	WrappedStyledComponent.shouldForwardProp = shouldForwardProp;

	// this static is used to preserve the cascade of static classes for component selector
	// purposes; this is especially important with usage of the css prop
	WrappedStyledComponent.foldedComponentIds = isTargetStyledComp
		? joinStrings(styledComponentTarget.foldedComponentIds, styledComponentTarget.styledComponentId)
		: '';

	WrappedStyledComponent.styledComponentId = styledComponentId;

	// fold the underlying StyledComponent target up since we folded the styles
	WrappedStyledComponent.target = isTargetStyledComp ? styledComponentTarget.target : target;

	Object.defineProperty(WrappedStyledComponent, 'defaultProps', {
		get() {
			return this._foldedDefaultProps;
		},

		set(obj) {
			this._foldedDefaultProps = isTargetStyledComp
				? merge({}, styledComponentTarget.defaultProps, obj)
				: obj;
		},
	});

	if (process.env.NODE_ENV !== 'production') {
		checkDynamicCreation(displayName, styledComponentId);

		WrappedStyledComponent.warnTooManyClasses = createWarnTooManyClasses(
			displayName,
			styledComponentId,
		);
	}

	setToString(WrappedStyledComponent, () => `.${WrappedStyledComponent.styledComponentId}`);

	if (isCompositeComponent) {
		const compositeComponentTarget = target as AnyComponent;

		hoist<typeof WrappedStyledComponent, typeof compositeComponentTarget>(
			WrappedStyledComponent,
			compositeComponentTarget,
			{
				// all SC-specific things should not be hoisted
				attrs: true,
				componentStyle: true,
				displayName: true,
				foldedComponentIds: true,
				shouldForwardProp: true,
				styledComponentId: true,
				target: true,
			} as { [key in keyof OmitNever<IStyledStatics<'web', OuterProps>>]: true },
		);
	}

	return WrappedStyledComponent;
}

export default createStyledComponent;
