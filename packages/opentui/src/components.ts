import {
	ASCIIFontRenderable,
	BoxRenderable,
	CodeRenderable,
	DiffRenderable,
	ImageRenderable,
	InputRenderable,
	LineNumberRenderable,
	MarkdownRenderable,
	ScrollBoxRenderable,
	SelectRenderable,
	TabSelectRenderable,
	TextareaRenderable,
	TextRenderable,
	TimeToFirstDrawRenderable,
} from '@opentui/core';
import type { RenderableConstructor } from './types.js';
import {
	BoldSpanRenderable,
	ItalicSpanRenderable,
	LineBreakRenderable,
	LinkRenderable,
	SpanRenderable,
	UnderlineSpanRenderable,
} from './text.js';

export const baseComponents = {
	box: BoxRenderable,
	text: TextRenderable,
	code: CodeRenderable,
	diff: DiffRenderable,
	markdown: MarkdownRenderable,
	input: InputRenderable,
	select: SelectRenderable,
	textarea: TextareaRenderable,
	scrollbox: ScrollBoxRenderable,
	'ascii-font': ASCIIFontRenderable,
	'tab-select': TabSelectRenderable,
	'line-number': LineNumberRenderable,
	image: ImageRenderable,
	'time-to-first-draw': TimeToFirstDrawRenderable,
	span: SpanRenderable,
	br: LineBreakRenderable,
	b: BoldSpanRenderable,
	strong: BoldSpanRenderable,
	i: ItalicSpanRenderable,
	em: ItalicSpanRenderable,
	u: UnderlineSpanRenderable,
	a: LinkRenderable,
} as const;

export type ComponentCatalogue = Record<string, RenderableConstructor>;

export const componentCatalogue: ComponentCatalogue = { ...baseComponents };

/** Add application-specific OpenTUI renderables to the intrinsic catalogue. */
export function extend<T extends ComponentCatalogue>(objects: T): void {
	Object.assign(componentCatalogue, objects);
}

export function getComponentCatalogue(): ComponentCatalogue {
	return componentCatalogue;
}
