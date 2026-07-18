// Ported from styled-components 6.4.3 (MIT), adapted for octane.
//
// Octane divergences from the upstream type surface:
// - No React: `AnyComponent` is any octane component function (`(props, scope?)`),
//   refs are plain props, and there is no `forwardRef` exotic-component machinery.
// - No per-tag `JSX.IntrinsicElements` introspection: the polymorphic call
//   surface is pragmatic — declared own props are fully typed, everything else
//   (DOM attributes, `as`-target props) flows through a permissive prop bag.
// - The `native` runtime does not exist; the `Runtime` generic is retained so
//   ported internals keep their upstream shape.
import type * as CSS from 'csstype';

import type ComponentStyle from './models/ComponentStyle';
import type { DefaultTheme } from './models/ThemeProvider';
import type createWarnTooManyClasses from './utils/createWarnTooManyClasses';
import type { SupportedHTMLElements } from './utils/domElements';

export type { CSS, DefaultTheme, SupportedHTMLElements };

/**
 * Use this type to disambiguate between a styled-component instance
 * and a StyleFunction or any other type of function.
 */
export type StyledComponentBrand = {
	readonly _sc: symbol;
};

export type BaseObject = {};

export type OmitNever<T> = {
	[K in keyof T as T[K] extends never ? never : K]: T[K];
};

export type FastOmit<T extends BaseObject, U extends string | number | symbol> = {
	[K in keyof T as K extends U ? never : K]: T[K];
};

export type Runtime = 'web';

/** Any octane component function. Refs arrive as a plain `ref` prop. */
export type AnyComponent<P extends BaseObject = any> = ((props: P, scope?: any) => unknown) & {
	displayName?: string | undefined;
	defaultProps?: Partial<P> | undefined;
};

export type KnownTarget = SupportedHTMLElements | AnyComponent;

/**
 * Octane replacement for `React.ComponentPropsWithRef<Target>`: infer a
 * component target's props from its function signature; host-tag strings have
 * no introspectable prop map and resolve to the permissive base.
 */
export type TargetProps<Target> = Target extends AnyComponent<infer P> ? P : BaseObject;
export type WebTarget =
	| (string & {}) // allow custom elements, etc.
	| KnownTarget;

export type StyledTarget<R extends Runtime> = R extends 'web' ? WebTarget : never;

export interface StyledOptions<R extends Runtime, Props extends BaseObject> {
	attrs?: Attrs<Props>[] | undefined;
	componentId?: (R extends 'web' ? string : never) | undefined;
	displayName?: string | undefined;
	parentComponentId?: (R extends 'web' ? string : never) | undefined;
	shouldForwardProp?: ShouldForwardProp<R> | undefined;
}

export type Dict<T = any> = { [key: string]: T };

/**
 * This type is intended for when data attributes are composed via
 * the `.attrs` API:
 *
 * ```tsx
 * styled.div.attrs<DataAttributes>({ 'data-testid': 'foo' })``
 * ```
 */
export type DataAttributes = { [key: `data-${string}`]: any };

export type ExecutionProps = {
	/**
	 * Dynamically adjust the rendered component or HTML tag, e.g.
	 * ```
	 * const StyledButton = styled.button``
	 *
	 * <StyledButton as="a" href="/foo">
	 *   I'm an anchor now
	 * </StyledButton>
	 * ```
	 */
	as?: KnownTarget | undefined;
	forwardedAs?: KnownTarget | undefined;
	theme?: DefaultTheme | undefined;
};

/**
 * ExecutionProps but with `theme` narrowed from optional to required.
 */
export interface ExecutionContext extends ExecutionProps {
	theme: DefaultTheme;
}

export interface StyleFunction<Props extends BaseObject> {
	(executionContext: ExecutionContext & Props): Interpolation<Props>;
}

export type Interpolation<Props extends BaseObject> =
	| StyleFunction<Props>
	| StyledObject<Props>
	| TemplateStringsArray
	| string
	| number
	| false
	| undefined
	| null
	| Keyframes
	| StyledComponentBrand
	| RuleSet<Props>
	| Interpolation<Props>[];

/**
 * Attr objects/functions may provide any DOM prop alongside the declared
 * ones (octane has no per-tag prop map to introspect, so the DOM surface is
 * a permissive bag — declared prop types still win inside the intersection).
 */
export type AttrsResultShape<Props extends BaseObject = BaseObject> = ExecutionProps &
	Partial<Props> & { [key: string]: any };

export type Attrs<Props extends BaseObject = BaseObject> =
	| AttrsResultShape<Props>
	| ((props: ExecutionContext & Props) => AttrsResultShape<Props>);

export type RuleSet<Props extends BaseObject = BaseObject> = Interpolation<Props>[];

export type Styles<Props extends BaseObject> =
	| TemplateStringsArray
	| StyledObject<Props>
	| StyleFunction<Props>;

export type NameGenerator = (hash: number) => string;

export interface StyleSheet {
	create: Function;
}

export interface Keyframes {
	id: string;
	name: string;
	rules: string;
}

export interface Flattener<Props extends BaseObject> {
	(
		chunks: Interpolation<Props>[],
		executionContext: object | null | undefined,
		styleSheet: StyleSheet | null | undefined,
	): Interpolation<Props>[];
}

export interface Stringifier {
	(
		css: string,
		selector?: string | undefined,
		prefix?: string | undefined,
		componentId?: string | undefined,
	): string[];
	hash: string;
}

export interface ShouldForwardProp<R extends Runtime> {
	(prop: string, elementToBeCreated: StyledTarget<R>): boolean;
}

export interface CommonStatics<R extends Runtime, Props extends BaseObject> {
	attrs: Attrs<Props>[];
	target: StyledTarget<R>;
	shouldForwardProp?: ShouldForwardProp<R> | undefined;
}

export interface IStyledStatics<
	R extends Runtime,
	OuterProps extends BaseObject,
> extends CommonStatics<R, OuterProps> {
	componentStyle: ComponentStyle;
	foldedComponentIds: string;
	target: StyledTarget<R>;
	styledComponentId: string;
	warnTooManyClasses?: ReturnType<typeof createWarnTooManyClasses> | undefined;
}

/**
 * The pragmatic octane polymorphic call surface: declared own props are fully
 * typed; `as`/`forwardedAs` retarget rendering; all remaining DOM/`as`-target
 * props flow through a permissive prop bag (octane has no per-tag
 * `JSX.IntrinsicElements` map to introspect).
 */
export type PolymorphicCallProps<BaseProps extends BaseObject> = FastOmit<
	BaseProps,
	'as' | 'forwardedAs'
> &
	ExecutionProps & {
		className?: string | undefined;
		style?: CSSPropertiesWithVars | (string & {}) | undefined;
		children?: any;
		ref?: any;
	} & { [key: string]: any };

export interface PolymorphicComponent<R extends Runtime, BaseProps extends BaseObject> {
	(props: PolymorphicCallProps<WidenUntypedProps<BaseProps>>, scope?: any): unknown;
	displayName?: string | undefined;
}

/**
 * Targets whose props can't be introspected collapse to `{}`; fall back to a
 * permissive prop bag so such components stay usable at the call site.
 */
export type WidenUntypedProps<Props extends BaseObject> = (
	Props extends unknown ? (keyof Props extends never ? true : false) : never
) extends true
	? Props & { [key: string]: unknown }
	: Props;

export interface IStyledComponentBase<R extends Runtime, Props extends BaseObject = BaseObject>
	extends PolymorphicComponent<R, Props>, IStyledStatics<R, Props>, StyledComponentBrand {
	defaultProps?: (ExecutionProps & Partial<Props>) | undefined;
	toString: () => string;
}

/**
 * Intersected with `string` so styled components can be used as computed
 * property keys in object styles: `{ [MyComponent]: { ... } }`.
 */
export type IStyledComponent<
	R extends Runtime,
	Props extends BaseObject = BaseObject,
> = IStyledComponentBase<R, Props> & string;

export interface IStyledComponentFactory<
	R extends Runtime,
	Target extends StyledTarget<R>,
	OuterProps extends BaseObject,
	OuterStatics extends BaseObject = BaseObject,
> {
	<Props extends BaseObject = BaseObject, Statics extends BaseObject = BaseObject>(
		target: Target,
		options: StyledOptions<R, OuterProps & Props>,
		rules: RuleSet<OuterProps & Props>,
	): IStyledComponent<R, Substitute<OuterProps, Props>> & OuterStatics & Statics;
}

export type CSSProperties = CSS.Properties<number | (string & {})>;

export type CSSPropertiesWithVars = CSSProperties & {
	[key: `--${string}`]: string | number | undefined;
};

export type CSSPseudos = { [K in CSS.Pseudos]?: CSSObject };

export type CSSKeyframes = object & { [key: string]: CSSObject };

export type CSSObject<Props extends BaseObject = BaseObject> = StyledObject<Props>;

export interface StyledObject<Props extends BaseObject = BaseObject>
	extends CSSProperties, CSSPseudos {
	[key: string]:
		| StyledObject<Props>
		| string
		| number
		| StyleFunction<Props>
		| RuleSet<any>
		| undefined;
}

/**
 * The babel `css` prop is not supported by the octane port; the type is kept
 * so shared upstream code and annotations continue to compile.
 */
export type CSSProp = Interpolation<any>;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Substitute<A extends BaseObject, B extends BaseObject> = keyof B extends never
	? A
	: FastOmit<A, keyof B> & B;

/**
 * Makes keys in K optional while keeping all others required.
 * Used to make attrs-provided props optional on the final component.
 */
export type MakeAttrsOptional<P extends BaseObject, K extends keyof any> = keyof K extends never
	? P
	: FastOmit<P, K & keyof P> & Partial<Pick<P, K & keyof P>>;

export type InsertionTarget = HTMLElement | ShadowRoot;
