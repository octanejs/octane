import type {
	ASCIIFontOptions,
	ASCIIFontRenderable,
	BaseRenderable,
	BoxOptions,
	BoxRenderable,
	CodeOptions,
	CodeRenderable,
	ContentChangeEvent,
	CursorChangeEvent,
	DiffRenderable,
	DiffRenderableOptions,
	ImageRenderable,
	ImageRenderableOptions,
	InputRenderable,
	InputRenderableOptions,
	KeyEvent,
	LineNumberOptions,
	LineNumberRenderable,
	MarkdownOptions,
	MarkdownRenderable,
	RenderContext,
	RenderableOptions,
	ScrollBoxOptions,
	ScrollBoxRenderable,
	SelectOption,
	SelectRenderable,
	SelectRenderableOptions,
	TabSelectOption,
	TabSelectRenderable,
	TabSelectRenderableOptions,
	TextareaOptions,
	TextareaRenderable,
	TextNodeOptions,
	TextNodeRenderable,
	TextOptions,
	TextRenderable,
	TimeToFirstDrawRenderable,
} from '@opentui/core';
import type { UniversalKey, UniversalRenderable } from 'octane/universal';

export type NonStyledProps =
	| 'id'
	| 'buffered'
	| 'live'
	| 'enableLayout'
	| 'selectable'
	| 'renderAfter'
	| 'renderBefore'
	| `on${string}`;

export type OpenTUIRef<T> =
	((value: T | null) => void | (() => void)) | { current: T | null } | readonly OpenTUIRef<T>[];

export type OctaneProps<TRenderable = unknown> = {
	key?: UniversalKey;
	ref?: OpenTUIRef<TRenderable>;
};

/** Source-compatible alias whose refs use Octane's refs-as-props contract. */
export type ReactProps<TRenderable = unknown> = OctaneProps<TRenderable>;

export type RenderableConstructor<TRenderable extends BaseRenderable = BaseRenderable> = new (
	ctx: RenderContext,
	options: any,
) => TRenderable;

type ExtractRenderableOptions<TConstructor> = TConstructor extends new (
	ctx: RenderContext,
	options: infer TOptions,
) => any
	? TOptions
	: never;

type ExtractRenderable<TConstructor> = TConstructor extends new (
	ctx: RenderContext,
	options: any,
) => infer TRenderable
	? TRenderable
	: never;

export type GetNonStyledProperties<TConstructor> =
	TConstructor extends RenderableConstructor<TextRenderable>
		? NonStyledProps | 'content'
		: TConstructor extends RenderableConstructor<BoxRenderable>
			? NonStyledProps | 'title' | 'bottomTitle'
			: TConstructor extends RenderableConstructor<ASCIIFontRenderable>
				? NonStyledProps | 'text' | 'selectable'
				: TConstructor extends RenderableConstructor<InputRenderable>
					? NonStyledProps | 'placeholder' | 'value'
					: TConstructor extends RenderableConstructor<TextareaRenderable>
						? NonStyledProps | 'placeholder' | 'initialValue'
						: TConstructor extends RenderableConstructor<CodeRenderable>
							? | NonStyledProps
								| 'content'
								| 'filetype'
								| 'syntaxStyle'
								| 'treeSitterClient'
								| 'conceal'
								| 'drawUnstyledText'
							: TConstructor extends RenderableConstructor<MarkdownRenderable>
								? | NonStyledProps
									| 'content'
									| 'syntaxStyle'
									| 'treeSitterClient'
									| 'conceal'
									| 'renderNode'
								: TConstructor extends RenderableConstructor<ImageRenderable>
									? NonStyledProps | 'source'
									: NonStyledProps;

type ContainerProps<TOptions> = TOptions & { children?: UniversalRenderable };

type ComponentProps<
	TOptions extends RenderableOptions<TRenderable>,
	TRenderable extends BaseRenderable,
> = TOptions & {
	style?: Partial<Omit<TOptions, GetNonStyledProperties<RenderableConstructor<TRenderable>>>>;
} & OctaneProps<TRenderable>;

type TextChildren = UniversalRenderable;

export type TextProps = ComponentProps<TextOptions, TextRenderable> & {
	children?: TextChildren;
};

export type SpanProps = ComponentProps<TextNodeOptions, TextNodeRenderable> & {
	children?: TextChildren;
};

export type LinkProps = SpanProps & { href: string };
export type LineBreakProps = Pick<SpanProps, 'id' | 'key' | 'ref'>;

export type BoxProps = ComponentProps<ContainerProps<BoxOptions>, BoxRenderable> & {
	focused?: boolean;
};

export type InputProps = ComponentProps<InputRenderableOptions, InputRenderable> & {
	focused?: boolean;
	onInput?: (value: string) => void;
	onChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
};

export type TextareaProps = ComponentProps<TextareaOptions, TextareaRenderable> & {
	focused?: boolean;
	onSubmit?: () => void;
	onContentChange?: (event: ContentChangeEvent) => void;
	onCursorChange?: (event: CursorChangeEvent) => void;
	onKeyDown?: (event: KeyEvent) => void;
};

export type CodeProps = ComponentProps<CodeOptions, CodeRenderable>;
export type ImageProps = ComponentProps<ImageRenderableOptions, ImageRenderable>;
export type MarkdownProps = ComponentProps<MarkdownOptions, MarkdownRenderable>;
export type DiffProps = ComponentProps<DiffRenderableOptions, DiffRenderable>;

export type SelectProps = ComponentProps<SelectRenderableOptions, SelectRenderable> & {
	focused?: boolean;
	onChange?: (index: number, option: SelectOption | null) => void;
	onSelect?: (index: number, option: SelectOption | null) => void;
};

export type ScrollBoxProps = ComponentProps<
	ContainerProps<ScrollBoxOptions>,
	ScrollBoxRenderable
> & {
	focused?: boolean;
};

export type AsciiFontProps = ComponentProps<ASCIIFontOptions, ASCIIFontRenderable>;

export type TabSelectProps = ComponentProps<TabSelectRenderableOptions, TabSelectRenderable> & {
	focused?: boolean;
	onChange?: (index: number, option: TabSelectOption | null) => void;
	onSelect?: (index: number, option: TabSelectOption | null) => void;
};

export type LineNumberProps = ComponentProps<
	ContainerProps<LineNumberOptions>,
	LineNumberRenderable
> & { focused?: boolean };

export type TimeToFirstDrawProps = ExtendedComponentProps<typeof TimeToFirstDrawRenderable>;

export type ExtendedComponentProps<
	TConstructor extends RenderableConstructor,
	TOptions = ExtractRenderableOptions<TConstructor>,
> = TOptions & {
	children?: UniversalRenderable;
	style?: Partial<Omit<TOptions, GetNonStyledProperties<TConstructor>>>;
} & OctaneProps<ExtractRenderable<TConstructor>>;

export type ExtendedIntrinsicElements<
	TComponentCatalogue extends Record<string, RenderableConstructor>,
> = {
	[TComponentName in keyof TComponentCatalogue]: ExtendedComponentProps<
		TComponentCatalogue[TComponentName]
	>;
};

/** Augment this interface to type application-specific tags registered with extend(). */
export interface OpenTUIComponents {
	[componentName: string]: RenderableConstructor;
}

export interface OpenTUIIntrinsicElements extends ExtendedIntrinsicElements<OpenTUIComponents> {
	box: BoxProps;
	text: TextProps;
	span: SpanProps;
	code: CodeProps;
	diff: DiffProps;
	markdown: MarkdownProps;
	input: InputProps;
	textarea: TextareaProps;
	select: SelectProps;
	scrollbox: ScrollBoxProps;
	'ascii-font': AsciiFontProps;
	'tab-select': TabSelectProps;
	'line-number': LineNumberProps;
	image: ImageProps;
	'time-to-first-draw': TimeToFirstDrawProps;
	b: SpanProps;
	i: SpanProps;
	u: SpanProps;
	strong: SpanProps;
	em: SpanProps;
	br: LineBreakProps;
	a: LinkProps;
}
