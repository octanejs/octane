/**
 * Octane's JSX type surface (`jsxImportSource: "octane"`).
 *
 * React-shaped by design — the `Octane` namespace MIRRORS `@types/react`'s
 * structure (`Octane.DetailedHTMLProps<Octane.HTMLAttributes<T>, T>`, one
 * specialized attribute interface per element family, a literal per-tag
 * `IntrinsicElements` interface) so editor hovers and errors read exactly like
 * React's with the `Octane` name, and so consumers can augment the attribute
 * interfaces the same way they augment React's. The per-tag table and the
 * attribute-interface list are derived mechanically from `@types/react`'s
 * `JSX.IntrinsicElements`.
 *
 * Octane's documented divergences are applied by the `Transformed` layer:
 *
 *  - `class` / `className` compose clsx-style (strings, numbers, arrays,
 *    objects, nesting; falsy drops out) — both accept `ClassValue`.
 *  - Events are NATIVE, delegated DOM events. React's handler NAMES are kept
 *    (`onClick`, `onMouseDown`, `onDoubleClick`, every `…Capture` variant —
 *    the compiler lowercases the name, special-casing `onDoubleClick` →
 *    `dblclick`), but each handler receives the NATIVE event (the synthetic
 *    type's `nativeEvent`): `onInput` gets a real `InputEvent` per keystroke,
 *    `onChange` is the native change event — no synthetic normalization.
 *  - `ref` accepts a callback (with optional React-19 cleanup return), a ref
 *    object, or an ARRAY of refs — nested arrays flatten (no `forwardRef`).
 *  - `for` is the native attribute (React's `htmlFor` alias also works).
 *  - `children` are octane renderables (`unknown`), not `ReactNode`.
 *  - `style` accepts a plain string as well as the object form (boolean
 *    property values clear the property, React-style).
 *  - `<Fragment>` accepts a `ref` (fragment-refs parity).
 *
 * Types only: compiled `.tsrx`/`.tsx` never imports this module at runtime —
 * the octane compiler lowers JSX to templates before any jsx() call could be
 * emitted. It exists so TypeScript (editors, tsrx-tsc, plain tsc over octane
 * `.tsx` sources) can type-check JSX against octane's real contract.
 */
import type * as React from 'react';
import type { ElementDescriptor } from './index.js';

/**
 * Octane's element type — the analog of React's `ReactElement`, and what a
 * JSX expression types as (`Octane.JSX.Element extends OctaneElement`). Backed
 * by the runtime's real `ElementDescriptor`, whose `$$kind` brand keeps it
 * nominal: arbitrary `{ type, props, key }` objects don't pass for elements.
 * Like React's, the props parameter defaults to `any` — elements are opaque
 * values to carry, not structures to inspect.
 */
export interface OctaneElement<P = any> extends ElementDescriptor<P> {}

export type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly ClassValue[]
	| { readonly [name: string]: unknown };

/**
 * React's synthetic handler props (all of `DOMAttributes` except children and
 * dangerouslySetInnerHTML). The NAMES are octane's public event surface; only
 * the parameter types change (native instead of synthetic).
 */
type ReactSyntheticProps = Exclude<
	keyof React.DOMAttributes<Element>,
	'children' | 'dangerouslySetInnerHTML'
>;

/**
 * Convert one React synthetic handler type to its native form: the parameter
 * becomes the synthetic type's `nativeEvent`, with octane's delegated
 * `currentTarget` (the handler's own element).
 */
type NativeHandler<H, T> =
	NonNullable<H> extends (event: infer SE) => unknown
		? SE extends { nativeEvent: infer NE }
			? (event: NE & { currentTarget: T }) => void
			: (event: Event & { currentTarget: T }) => void
		: never;

type NativeEventHandlers<P, T> = {
	[K in Extract<keyof P, ReactSyntheticProps>]?: NativeHandler<P[K], T>;
};

/** Octane's attribute transform over one React attribute interface. */
type Transformed<P, T> = Omit<P, ReactSyntheticProps | 'className' | 'style' | 'children'> &
	NativeEventHandlers<P, T & EventTarget> & {
		class?: ClassValue;
		className?: ClassValue;
		for?: string;
		style?: string | React.CSSProperties;
		children?: unknown;
	};

declare namespace Octane {
	type Key = string | number | bigint;

	/** Octane ref forms: callback (optional cleanup), object, or (nested) arrays. */
	type Ref<T> = React.Ref<T> | readonly Ref<T>[];

	interface Attributes {
		key?: Key | null | undefined;
	}
	interface RefAttributes<T> extends Attributes {
		ref?: Ref<T> | undefined;
	}

	type DetailedHTMLProps<E, T> = RefAttributes<T> & E;

	interface AnchorHTMLAttributes<T> extends Transformed<React.AnchorHTMLAttributes<T>, T> {}
	interface AreaHTMLAttributes<T> extends Transformed<React.AreaHTMLAttributes<T>, T> {}
	interface AudioHTMLAttributes<T> extends Transformed<React.AudioHTMLAttributes<T>, T> {}
	interface BaseHTMLAttributes<T> extends Transformed<React.BaseHTMLAttributes<T>, T> {}
	interface BlockquoteHTMLAttributes<T> extends Transformed<React.BlockquoteHTMLAttributes<T>, T> {}
	interface ButtonHTMLAttributes<T> extends Transformed<React.ButtonHTMLAttributes<T>, T> {}
	interface CanvasHTMLAttributes<T> extends Transformed<React.CanvasHTMLAttributes<T>, T> {}
	interface ColHTMLAttributes<T> extends Transformed<React.ColHTMLAttributes<T>, T> {}
	interface ColgroupHTMLAttributes<T> extends Transformed<React.ColgroupHTMLAttributes<T>, T> {}
	interface DataHTMLAttributes<T> extends Transformed<React.DataHTMLAttributes<T>, T> {}
	interface DelHTMLAttributes<T> extends Transformed<React.DelHTMLAttributes<T>, T> {}
	interface DetailsHTMLAttributes<T> extends Transformed<React.DetailsHTMLAttributes<T>, T> {}
	interface DialogHTMLAttributes<T> extends Transformed<React.DialogHTMLAttributes<T>, T> {}
	interface EmbedHTMLAttributes<T> extends Transformed<React.EmbedHTMLAttributes<T>, T> {}
	interface FieldsetHTMLAttributes<T> extends Transformed<React.FieldsetHTMLAttributes<T>, T> {}
	interface FormHTMLAttributes<T> extends Transformed<React.FormHTMLAttributes<T>, T> {}
	interface HTMLAttributes<T> extends Transformed<React.HTMLAttributes<T>, T> {}
	interface HtmlHTMLAttributes<T> extends Transformed<React.HtmlHTMLAttributes<T>, T> {}
	interface IframeHTMLAttributes<T> extends Transformed<React.IframeHTMLAttributes<T>, T> {}
	interface ImgHTMLAttributes<T> extends Transformed<React.ImgHTMLAttributes<T>, T> {}
	interface InputHTMLAttributes<T> extends Transformed<React.InputHTMLAttributes<T>, T> {}
	interface InsHTMLAttributes<T> extends Transformed<React.InsHTMLAttributes<T>, T> {}
	interface KeygenHTMLAttributes<T> extends Transformed<React.KeygenHTMLAttributes<T>, T> {}
	interface LabelHTMLAttributes<T> extends Transformed<React.LabelHTMLAttributes<T>, T> {}
	interface LiHTMLAttributes<T> extends Transformed<React.LiHTMLAttributes<T>, T> {}
	interface LinkHTMLAttributes<T> extends Transformed<React.LinkHTMLAttributes<T>, T> {}
	interface MapHTMLAttributes<T> extends Transformed<React.MapHTMLAttributes<T>, T> {}
	interface MenuHTMLAttributes<T> extends Transformed<React.MenuHTMLAttributes<T>, T> {}
	interface MetaHTMLAttributes<T> extends Transformed<React.MetaHTMLAttributes<T>, T> {}
	interface MeterHTMLAttributes<T> extends Transformed<React.MeterHTMLAttributes<T>, T> {}
	interface ObjectHTMLAttributes<T> extends Transformed<React.ObjectHTMLAttributes<T>, T> {}
	interface OlHTMLAttributes<T> extends Transformed<React.OlHTMLAttributes<T>, T> {}
	interface OptgroupHTMLAttributes<T> extends Transformed<React.OptgroupHTMLAttributes<T>, T> {}
	interface OptionHTMLAttributes<T> extends Transformed<React.OptionHTMLAttributes<T>, T> {}
	interface OutputHTMLAttributes<T> extends Transformed<React.OutputHTMLAttributes<T>, T> {}
	interface ParamHTMLAttributes<T> extends Transformed<React.ParamHTMLAttributes<T>, T> {}
	interface ProgressHTMLAttributes<T> extends Transformed<React.ProgressHTMLAttributes<T>, T> {}
	interface QuoteHTMLAttributes<T> extends Transformed<React.QuoteHTMLAttributes<T>, T> {}
	interface SVGAttributes<T> extends Transformed<React.SVGAttributes<T>, T> {}
	interface ScriptHTMLAttributes<T> extends Transformed<React.ScriptHTMLAttributes<T>, T> {}
	interface SelectHTMLAttributes<T> extends Transformed<React.SelectHTMLAttributes<T>, T> {}
	interface SlotHTMLAttributes<T> extends Transformed<React.SlotHTMLAttributes<T>, T> {}
	interface SourceHTMLAttributes<T> extends Transformed<React.SourceHTMLAttributes<T>, T> {}
	interface StyleHTMLAttributes<T> extends Transformed<React.StyleHTMLAttributes<T>, T> {}
	interface TableHTMLAttributes<T> extends Transformed<React.TableHTMLAttributes<T>, T> {}
	interface TdHTMLAttributes<T> extends Transformed<React.TdHTMLAttributes<T>, T> {}
	interface TextareaHTMLAttributes<T> extends Transformed<React.TextareaHTMLAttributes<T>, T> {}
	interface ThHTMLAttributes<T> extends Transformed<React.ThHTMLAttributes<T>, T> {}
	interface TimeHTMLAttributes<T> extends Transformed<React.TimeHTMLAttributes<T>, T> {}
	interface TrackHTMLAttributes<T> extends Transformed<React.TrackHTMLAttributes<T>, T> {}
	interface VideoHTMLAttributes<T> extends Transformed<React.VideoHTMLAttributes<T>, T> {}
	interface WebViewHTMLAttributes<T> extends Transformed<React.WebViewHTMLAttributes<T>, T> {}

	interface SVGProps<T> extends SVGAttributes<T>, RefAttributes<T> {}
	type SVGLineElementAttributes<T> = SVGProps<T>;
	type SVGTextElementAttributes<T> = SVGProps<T>;

	namespace JSX {
		// Mirrors React's `JSX.Element extends ReactElement<any, any>`: a JSX
		// expression is an opaque-but-real element value.
		interface Element extends OctaneElement {}
		// `any` disables tag/return-type validation: an octane component is ANY
		// function used at a `<F/>` site, and may return renderables TS cannot
		// know about (primitives, null, arrays) — the compiler owns that check.
		type ElementType = any;
		interface ElementChildrenAttribute {
			children: {};
		}
		interface IntrinsicAttributes extends Octane.Attributes {}
		interface IntrinsicElements {
			a: Octane.DetailedHTMLProps<
				Octane.AnchorHTMLAttributes<HTMLAnchorElement>,
				HTMLAnchorElement
			>;
			abbr: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			address: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			area: Octane.DetailedHTMLProps<Octane.AreaHTMLAttributes<HTMLAreaElement>, HTMLAreaElement>;
			article: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			aside: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			audio: Octane.DetailedHTMLProps<
				Octane.AudioHTMLAttributes<HTMLAudioElement>,
				HTMLAudioElement
			>;
			b: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			base: Octane.DetailedHTMLProps<Octane.BaseHTMLAttributes<HTMLBaseElement>, HTMLBaseElement>;
			bdi: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			bdo: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			big: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			blockquote: Octane.DetailedHTMLProps<
				Octane.BlockquoteHTMLAttributes<HTMLQuoteElement>,
				HTMLQuoteElement
			>;
			body: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLBodyElement>, HTMLBodyElement>;
			br: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLBRElement>, HTMLBRElement>;
			button: Octane.DetailedHTMLProps<
				Octane.ButtonHTMLAttributes<HTMLButtonElement>,
				HTMLButtonElement
			>;
			canvas: Octane.DetailedHTMLProps<
				Octane.CanvasHTMLAttributes<HTMLCanvasElement>,
				HTMLCanvasElement
			>;
			caption: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			center: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			cite: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			code: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			col: Octane.DetailedHTMLProps<
				Octane.ColHTMLAttributes<HTMLTableColElement>,
				HTMLTableColElement
			>;
			colgroup: Octane.DetailedHTMLProps<
				Octane.ColgroupHTMLAttributes<HTMLTableColElement>,
				HTMLTableColElement
			>;
			data: Octane.DetailedHTMLProps<Octane.DataHTMLAttributes<HTMLDataElement>, HTMLDataElement>;
			datalist: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLDataListElement>,
				HTMLDataListElement
			>;
			dd: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			del: Octane.DetailedHTMLProps<Octane.DelHTMLAttributes<HTMLModElement>, HTMLModElement>;
			details: Octane.DetailedHTMLProps<
				Octane.DetailsHTMLAttributes<HTMLDetailsElement>,
				HTMLDetailsElement
			>;
			dfn: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			dialog: Octane.DetailedHTMLProps<
				Octane.DialogHTMLAttributes<HTMLDialogElement>,
				HTMLDialogElement
			>;
			div: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
			dl: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLDListElement>, HTMLDListElement>;
			dt: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			em: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			embed: Octane.DetailedHTMLProps<
				Octane.EmbedHTMLAttributes<HTMLEmbedElement>,
				HTMLEmbedElement
			>;
			fieldset: Octane.DetailedHTMLProps<
				Octane.FieldsetHTMLAttributes<HTMLFieldSetElement>,
				HTMLFieldSetElement
			>;
			figcaption: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			figure: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			footer: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			form: Octane.DetailedHTMLProps<Octane.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>;
			h1: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			h2: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			h3: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			h4: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			h5: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			h6: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
			head: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>;
			header: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			hgroup: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			hr: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLHRElement>, HTMLHRElement>;
			html: Octane.DetailedHTMLProps<Octane.HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>;
			i: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			iframe: Octane.DetailedHTMLProps<
				Octane.IframeHTMLAttributes<HTMLIFrameElement>,
				HTMLIFrameElement
			>;
			img: Octane.DetailedHTMLProps<Octane.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;
			input: Octane.DetailedHTMLProps<
				Octane.InputHTMLAttributes<HTMLInputElement>,
				HTMLInputElement
			>;
			ins: Octane.DetailedHTMLProps<Octane.InsHTMLAttributes<HTMLModElement>, HTMLModElement>;
			kbd: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			keygen: Octane.DetailedHTMLProps<Octane.KeygenHTMLAttributes<HTMLElement>, HTMLElement>;
			label: Octane.DetailedHTMLProps<
				Octane.LabelHTMLAttributes<HTMLLabelElement>,
				HTMLLabelElement
			>;
			legend: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLLegendElement>, HTMLLegendElement>;
			li: Octane.DetailedHTMLProps<Octane.LiHTMLAttributes<HTMLLIElement>, HTMLLIElement>;
			link: Octane.DetailedHTMLProps<Octane.LinkHTMLAttributes<HTMLLinkElement>, HTMLLinkElement>;
			main: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			map: Octane.DetailedHTMLProps<Octane.MapHTMLAttributes<HTMLMapElement>, HTMLMapElement>;
			mark: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			menu: Octane.DetailedHTMLProps<Octane.MenuHTMLAttributes<HTMLElement>, HTMLElement>;
			menuitem: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			meta: Octane.DetailedHTMLProps<Octane.MetaHTMLAttributes<HTMLMetaElement>, HTMLMetaElement>;
			meter: Octane.DetailedHTMLProps<
				Octane.MeterHTMLAttributes<HTMLMeterElement>,
				HTMLMeterElement
			>;
			nav: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			noindex: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			noscript: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			object: Octane.DetailedHTMLProps<
				Octane.ObjectHTMLAttributes<HTMLObjectElement>,
				HTMLObjectElement
			>;
			ol: Octane.DetailedHTMLProps<Octane.OlHTMLAttributes<HTMLOListElement>, HTMLOListElement>;
			optgroup: Octane.DetailedHTMLProps<
				Octane.OptgroupHTMLAttributes<HTMLOptGroupElement>,
				HTMLOptGroupElement
			>;
			option: Octane.DetailedHTMLProps<
				Octane.OptionHTMLAttributes<HTMLOptionElement>,
				HTMLOptionElement
			>;
			output: Octane.DetailedHTMLProps<
				Octane.OutputHTMLAttributes<HTMLOutputElement>,
				HTMLOutputElement
			>;
			p: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLParagraphElement>,
				HTMLParagraphElement
			>;
			param: Octane.DetailedHTMLProps<
				Octane.ParamHTMLAttributes<HTMLParamElement>,
				HTMLParamElement
			>;
			picture: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			pre: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLPreElement>, HTMLPreElement>;
			progress: Octane.DetailedHTMLProps<
				Octane.ProgressHTMLAttributes<HTMLProgressElement>,
				HTMLProgressElement
			>;
			q: Octane.DetailedHTMLProps<Octane.QuoteHTMLAttributes<HTMLQuoteElement>, HTMLQuoteElement>;
			rp: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			rt: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			ruby: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			s: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			samp: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			search: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			slot: Octane.DetailedHTMLProps<Octane.SlotHTMLAttributes<HTMLSlotElement>, HTMLSlotElement>;
			script: Octane.DetailedHTMLProps<
				Octane.ScriptHTMLAttributes<HTMLScriptElement>,
				HTMLScriptElement
			>;
			section: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			select: Octane.DetailedHTMLProps<
				Octane.SelectHTMLAttributes<HTMLSelectElement>,
				HTMLSelectElement
			>;
			small: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			source: Octane.DetailedHTMLProps<
				Octane.SourceHTMLAttributes<HTMLSourceElement>,
				HTMLSourceElement
			>;
			span: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>;
			strong: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			style: Octane.DetailedHTMLProps<
				Octane.StyleHTMLAttributes<HTMLStyleElement>,
				HTMLStyleElement
			>;
			sub: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			summary: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			sup: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			table: Octane.DetailedHTMLProps<
				Octane.TableHTMLAttributes<HTMLTableElement>,
				HTMLTableElement
			>;
			template: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLTemplateElement>,
				HTMLTemplateElement
			>;
			tbody: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLTableSectionElement>,
				HTMLTableSectionElement
			>;
			td: Octane.DetailedHTMLProps<
				Octane.TdHTMLAttributes<HTMLTableDataCellElement>,
				HTMLTableDataCellElement
			>;
			textarea: Octane.DetailedHTMLProps<
				Octane.TextareaHTMLAttributes<HTMLTextAreaElement>,
				HTMLTextAreaElement
			>;
			tfoot: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLTableSectionElement>,
				HTMLTableSectionElement
			>;
			th: Octane.DetailedHTMLProps<
				Octane.ThHTMLAttributes<HTMLTableHeaderCellElement>,
				HTMLTableHeaderCellElement
			>;
			thead: Octane.DetailedHTMLProps<
				Octane.HTMLAttributes<HTMLTableSectionElement>,
				HTMLTableSectionElement
			>;
			time: Octane.DetailedHTMLProps<Octane.TimeHTMLAttributes<HTMLTimeElement>, HTMLTimeElement>;
			title: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLTitleElement>, HTMLTitleElement>;
			tr: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
			track: Octane.DetailedHTMLProps<
				Octane.TrackHTMLAttributes<HTMLTrackElement>,
				HTMLTrackElement
			>;
			u: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			ul: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLUListElement>, HTMLUListElement>;
			var: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			video: Octane.DetailedHTMLProps<
				Octane.VideoHTMLAttributes<HTMLVideoElement>,
				HTMLVideoElement
			>;
			wbr: Octane.DetailedHTMLProps<Octane.HTMLAttributes<HTMLElement>, HTMLElement>;
			webview: Octane.DetailedHTMLProps<
				Octane.WebViewHTMLAttributes<HTMLWebViewElement>,
				HTMLWebViewElement
			>;
			svg: Octane.SVGProps<SVGSVGElement>;
			animate: Octane.SVGProps<SVGElement>;
			animateMotion: Octane.SVGProps<SVGElement>;
			animateTransform: Octane.SVGProps<SVGElement>;
			circle: Octane.SVGProps<SVGCircleElement>;
			clipPath: Octane.SVGProps<SVGClipPathElement>;
			defs: Octane.SVGProps<SVGDefsElement>;
			desc: Octane.SVGProps<SVGDescElement>;
			ellipse: Octane.SVGProps<SVGEllipseElement>;
			feBlend: Octane.SVGProps<SVGFEBlendElement>;
			feColorMatrix: Octane.SVGProps<SVGFEColorMatrixElement>;
			feComponentTransfer: Octane.SVGProps<SVGFEComponentTransferElement>;
			feComposite: Octane.SVGProps<SVGFECompositeElement>;
			feConvolveMatrix: Octane.SVGProps<SVGFEConvolveMatrixElement>;
			feDiffuseLighting: Octane.SVGProps<SVGFEDiffuseLightingElement>;
			feDisplacementMap: Octane.SVGProps<SVGFEDisplacementMapElement>;
			feDistantLight: Octane.SVGProps<SVGFEDistantLightElement>;
			feDropShadow: Octane.SVGProps<SVGFEDropShadowElement>;
			feFlood: Octane.SVGProps<SVGFEFloodElement>;
			feFuncA: Octane.SVGProps<SVGFEFuncAElement>;
			feFuncB: Octane.SVGProps<SVGFEFuncBElement>;
			feFuncG: Octane.SVGProps<SVGFEFuncGElement>;
			feFuncR: Octane.SVGProps<SVGFEFuncRElement>;
			feGaussianBlur: Octane.SVGProps<SVGFEGaussianBlurElement>;
			feImage: Octane.SVGProps<SVGFEImageElement>;
			feMerge: Octane.SVGProps<SVGFEMergeElement>;
			feMergeNode: Octane.SVGProps<SVGFEMergeNodeElement>;
			feMorphology: Octane.SVGProps<SVGFEMorphologyElement>;
			feOffset: Octane.SVGProps<SVGFEOffsetElement>;
			fePointLight: Octane.SVGProps<SVGFEPointLightElement>;
			feSpecularLighting: Octane.SVGProps<SVGFESpecularLightingElement>;
			feSpotLight: Octane.SVGProps<SVGFESpotLightElement>;
			feTile: Octane.SVGProps<SVGFETileElement>;
			feTurbulence: Octane.SVGProps<SVGFETurbulenceElement>;
			filter: Octane.SVGProps<SVGFilterElement>;
			foreignObject: Octane.SVGProps<SVGForeignObjectElement>;
			g: Octane.SVGProps<SVGGElement>;
			image: Octane.SVGProps<SVGImageElement>;
			line: Octane.SVGLineElementAttributes<SVGLineElement>;
			linearGradient: Octane.SVGProps<SVGLinearGradientElement>;
			marker: Octane.SVGProps<SVGMarkerElement>;
			mask: Octane.SVGProps<SVGMaskElement>;
			metadata: Octane.SVGProps<SVGMetadataElement>;
			mpath: Octane.SVGProps<SVGElement>;
			path: Octane.SVGProps<SVGPathElement>;
			pattern: Octane.SVGProps<SVGPatternElement>;
			polygon: Octane.SVGProps<SVGPolygonElement>;
			polyline: Octane.SVGProps<SVGPolylineElement>;
			radialGradient: Octane.SVGProps<SVGRadialGradientElement>;
			rect: Octane.SVGProps<SVGRectElement>;
			set: Octane.SVGProps<SVGSetElement>;
			stop: Octane.SVGProps<SVGStopElement>;
			switch: Octane.SVGProps<SVGSwitchElement>;
			symbol: Octane.SVGProps<SVGSymbolElement>;
			text: Octane.SVGTextElementAttributes<SVGTextElement>;
			textPath: Octane.SVGProps<SVGTextPathElement>;
			tspan: Octane.SVGProps<SVGTSpanElement>;
			use: Octane.SVGProps<SVGUseElement>;
			view: Octane.SVGProps<SVGViewElement>;
		}
	}
}

export import JSX = Octane.JSX;
export { Octane };

// The automatic-runtime entry points, for type resolution only — octane's
// compiler consumes JSX before any of these could be emitted. Signatures
// mirror @types/react's jsx-runtime (`jsx(type: ElementType, props, key?):
// ReactElement`), with the octane analogs in each position.
export declare function jsx(
	type: Octane.JSX.ElementType,
	props: unknown,
	key?: Octane.Key,
): OctaneElement;
export declare function jsxs(
	type: Octane.JSX.ElementType,
	props: unknown,
	key?: Octane.Key,
): OctaneElement;
// From React's jsx-DEV-runtime (octane serves both entries from this file).
export declare function jsxDEV(
	type: Octane.JSX.ElementType,
	props: unknown,
	key?: Octane.Key,
	isStaticChildren?: boolean,
	source?: unknown,
	self?: unknown,
): OctaneElement;
// Runtime-wise the compiler intercepts `Fragment` by name; type-wise it is a
// component accepting children, a key, and — octane extension (React canary
// `enableFragmentRefs` parity) — a fragment ref.
export declare function Fragment(props: {
	children?: unknown;
	key?: Octane.Key | null | undefined;
	ref?: Octane.Ref<unknown>;
}): OctaneElement;
