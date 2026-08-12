import type { ComponentBody, ElementDescriptor } from "octane";
import type { CSSProperties, HTMLProps, Key } from "react";

// OCTANE DIVERGENCE[custom-component-identity][types:adapted-custom-components]

export type LineNumberStyleFunction = (lineNumber: number) => CSSProperties;
export type LineTagPropsFunction = (
	lineNumber: number,
) => HTMLProps<HTMLElement>;

export interface RendererNode {
	type: "element" | "text";
	value?: string | number;
	tagName?: keyof HTMLElementTagNameMap | ComponentBody<any>;
	properties?: { className: any[]; [key: string]: any };
	children?: RendererNode[];
}

export interface RendererProps {
	rows: RendererNode[];
	stylesheet: Record<string, CSSProperties>;
	useInlineStyles: boolean;
}

export interface SyntaxHighlighterProps {
	language?: string;
	style?: Record<string, CSSProperties>;
	// OCTANE DIVERGENCE[compiled-children-value][types:adapted-compiled-children]
	children: string | string[];
	customStyle?: CSSProperties;
	codeTagProps?: HTMLProps<HTMLElement>;
	useInlineStyles?: boolean;
	showLineNumbers?: boolean;
	showInlineLineNumbers?: boolean;
	startingLineNumber?: number;
	lineNumberContainerStyle?: CSSProperties;
	lineNumberStyle?: CSSProperties | LineNumberStyleFunction;
	wrapLines?: boolean;
	wrapLongLines?: boolean;
	lineProps?: LineTagPropsFunction | HTMLProps<HTMLElement>;
	renderer?: (props: RendererProps) => unknown;
	PreTag?: keyof HTMLElementTagNameMap | ComponentBody<any>;
	CodeTag?: keyof HTMLElementTagNameMap | ComponentBody<any>;
	[spread: string]: any;
}

export interface CreateElementProps {
	node: RendererNode;
	stylesheet: Record<string, CSSProperties>;
	style?: CSSProperties;
	useInlineStyles: boolean;
	key: Key;
}

export interface HighlighterComponent {
	(props: SyntaxHighlighterProps): ElementDescriptor;
}

export interface SupportedLanguagesComponent extends HighlighterComponent {
	supportedLanguages: string[];
}

export interface LightComponent extends HighlighterComponent {
	registerLanguage(name: string, language: any): void;
}

export interface PrismLightComponent extends LightComponent {
	alias(name: string, alias: string | string[]): void;
	alias(aliases: Record<string, string | string[]>): void;
}

export interface AsyncComponent extends SupportedLanguagesComponent {
	preload(): Promise<void>;
	loadLanguage(language: string): Promise<void>;
	isSupportedLanguage(language: string): boolean;
	isRegistered(language: string): boolean;
}

export interface AsyncLightComponent extends AsyncComponent {
	registerLanguage(name: string, language: any): void;
}

declare const SyntaxHighlighter: SupportedLanguagesComponent;
export default SyntaxHighlighter;

export const LightAsync: AsyncLightComponent;
export const Light: LightComponent;
export const PrismAsyncLight: AsyncLightComponent;
export const PrismAsync: AsyncComponent;
export const PrismLight: PrismLightComponent;
export const Prism: SupportedLanguagesComponent;

export function createElement(props: CreateElementProps): ElementDescriptor;
