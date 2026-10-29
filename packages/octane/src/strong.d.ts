/**
 * The `octane` types a Strong module's TypeScript view imports (types only).
 *
 * A Strong module's hosts take the Strong JSX types, so the React-shaped host
 * prop types it names must describe the same hosts: a shadcn-style wrapper
 * spreading `ComponentProps<'span'>` onto `<span>` passes its callers' HTML
 * through, and its callers must therefore supply the brand. Each type here
 * narrows its `octane` counterpart, so a Strong wrapper's props still satisfy a
 * compatibility component's. Component props keep their authored types.
 */
import type * as Compat from './index.js';
import type { TrustedHTML } from './trusted-html.js';

export * from './index.js';
export type { JSX } from './jsx-runtime-strong.js';

type Strong<P> = P & {
	dangerouslySetInnerHTML?: TrustedHTML | undefined;
	suppressHydrationWarning?: never;
	suppressNativeChangeWarning?: never;
};

export type ComponentProps<
	T extends keyof Compat.JSX.IntrinsicElements | Compat.JSXElementConstructor<any>,
> =
	T extends Compat.JSXElementConstructor<any>
		? Compat.ComponentProps<T>
		: Strong<Compat.ComponentProps<T>>;
export type ComponentPropsWithRef<T extends Compat.ElementType> = ComponentProps<T>;
export type ComponentPropsWithoutRef<T extends Compat.ElementType> = Compat.PropsWithoutRef<
	ComponentProps<T>
>;
export type DOMAttributes<T> = Strong<Compat.DOMAttributes<T>>;
export type DetailedHTMLProps<E, T> = Strong<Compat.DetailedHTMLProps<E, T>>;
export type HTMLProps<T> = Strong<Compat.HTMLProps<T>>;
export type SVGProps<T> = Strong<Compat.SVGProps<T>>;
export type SVGLineElementAttributes<T> = Strong<Compat.SVGLineElementAttributes<T>>;
export type SVGTextElementAttributes<T> = Strong<Compat.SVGTextElementAttributes<T>>;
export type AnchorHTMLAttributes<T> = Strong<Compat.AnchorHTMLAttributes<T>>;
export type AreaHTMLAttributes<T> = Strong<Compat.AreaHTMLAttributes<T>>;
export type AudioHTMLAttributes<T> = Strong<Compat.AudioHTMLAttributes<T>>;
export type BaseHTMLAttributes<T> = Strong<Compat.BaseHTMLAttributes<T>>;
export type BlockquoteHTMLAttributes<T> = Strong<Compat.BlockquoteHTMLAttributes<T>>;
export type ButtonHTMLAttributes<T> = Strong<Compat.ButtonHTMLAttributes<T>>;
export type CanvasHTMLAttributes<T> = Strong<Compat.CanvasHTMLAttributes<T>>;
export type ColHTMLAttributes<T> = Strong<Compat.ColHTMLAttributes<T>>;
export type ColgroupHTMLAttributes<T> = Strong<Compat.ColgroupHTMLAttributes<T>>;
export type DataHTMLAttributes<T> = Strong<Compat.DataHTMLAttributes<T>>;
export type DelHTMLAttributes<T> = Strong<Compat.DelHTMLAttributes<T>>;
export type DetailsHTMLAttributes<T> = Strong<Compat.DetailsHTMLAttributes<T>>;
export type DialogHTMLAttributes<T> = Strong<Compat.DialogHTMLAttributes<T>>;
export type EmbedHTMLAttributes<T> = Strong<Compat.EmbedHTMLAttributes<T>>;
export type FieldsetHTMLAttributes<T> = Strong<Compat.FieldsetHTMLAttributes<T>>;
export type FormHTMLAttributes<T> = Strong<Compat.FormHTMLAttributes<T>>;
export type HTMLAttributes<T> = Strong<Compat.HTMLAttributes<T>>;
export type AllHTMLAttributes<T> = Strong<Compat.AllHTMLAttributes<T>>;
export type HtmlHTMLAttributes<T> = Strong<Compat.HtmlHTMLAttributes<T>>;
export type IframeHTMLAttributes<T> = Strong<Compat.IframeHTMLAttributes<T>>;
export type ImgHTMLAttributes<T> = Strong<Compat.ImgHTMLAttributes<T>>;
export type InputHTMLAttributes<T> = Strong<Compat.InputHTMLAttributes<T>>;
export type InsHTMLAttributes<T> = Strong<Compat.InsHTMLAttributes<T>>;
export type KeygenHTMLAttributes<T> = Strong<Compat.KeygenHTMLAttributes<T>>;
export type LabelHTMLAttributes<T> = Strong<Compat.LabelHTMLAttributes<T>>;
export type LiHTMLAttributes<T> = Strong<Compat.LiHTMLAttributes<T>>;
export type LinkHTMLAttributes<T> = Strong<Compat.LinkHTMLAttributes<T>>;
export type MapHTMLAttributes<T> = Strong<Compat.MapHTMLAttributes<T>>;
export type MenuHTMLAttributes<T> = Strong<Compat.MenuHTMLAttributes<T>>;
export type MetaHTMLAttributes<T> = Strong<Compat.MetaHTMLAttributes<T>>;
export type MeterHTMLAttributes<T> = Strong<Compat.MeterHTMLAttributes<T>>;
export type ObjectHTMLAttributes<T> = Strong<Compat.ObjectHTMLAttributes<T>>;
export type OlHTMLAttributes<T> = Strong<Compat.OlHTMLAttributes<T>>;
export type OptgroupHTMLAttributes<T> = Strong<Compat.OptgroupHTMLAttributes<T>>;
export type OptionHTMLAttributes<T> = Strong<Compat.OptionHTMLAttributes<T>>;
export type OutputHTMLAttributes<T> = Strong<Compat.OutputHTMLAttributes<T>>;
export type ParamHTMLAttributes<T> = Strong<Compat.ParamHTMLAttributes<T>>;
export type ProgressHTMLAttributes<T> = Strong<Compat.ProgressHTMLAttributes<T>>;
export type QuoteHTMLAttributes<T> = Strong<Compat.QuoteHTMLAttributes<T>>;
export type SVGAttributes<T> = Strong<Compat.SVGAttributes<T>>;
export type ScriptHTMLAttributes<T> = Strong<Compat.ScriptHTMLAttributes<T>>;
export type SelectHTMLAttributes<T> = Strong<Compat.SelectHTMLAttributes<T>>;
export type SlotHTMLAttributes<T> = Strong<Compat.SlotHTMLAttributes<T>>;
export type SourceHTMLAttributes<T> = Strong<Compat.SourceHTMLAttributes<T>>;
export type StyleHTMLAttributes<T> = Strong<Compat.StyleHTMLAttributes<T>>;
export type TableHTMLAttributes<T> = Strong<Compat.TableHTMLAttributes<T>>;
export type TdHTMLAttributes<T> = Strong<Compat.TdHTMLAttributes<T>>;
export type TextareaHTMLAttributes<T> = Strong<Compat.TextareaHTMLAttributes<T>>;
export type ThHTMLAttributes<T> = Strong<Compat.ThHTMLAttributes<T>>;
export type TimeHTMLAttributes<T> = Strong<Compat.TimeHTMLAttributes<T>>;
export type TrackHTMLAttributes<T> = Strong<Compat.TrackHTMLAttributes<T>>;
export type VideoHTMLAttributes<T> = Strong<Compat.VideoHTMLAttributes<T>>;
export type WebViewHTMLAttributes<T> = Strong<Compat.WebViewHTMLAttributes<T>>;
