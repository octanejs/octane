import type { Element, Parents } from 'hast';
import type { ComponentBody, OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import type { Options as RemarkRehypeOptions } from 'remark-rehype';
import type { PluggableList } from 'unified';

export type AllowElement = (
	element: Readonly<Element>,
	index: number,
	parent: Readonly<Parents> | undefined,
) => boolean | null | undefined;

export interface ExtraProps {
	node?: Element | undefined;
}

export type Components = {
	[Key in keyof Octane.JSX.IntrinsicElements]?:
		| ComponentBody<Octane.JSX.IntrinsicElements[Key] & ExtraProps>
		| keyof Octane.JSX.IntrinsicElements;
};

export type UrlTransform = (
	url: string,
	key: string,
	node: Readonly<Element>,
) => string | null | undefined;

export interface Options {
	allowElement?: AllowElement | null | undefined;
	allowedElements?: ReadonlyArray<string> | null | undefined;
	children?: string | null | undefined;
	components?: Components | null | undefined;
	disallowedElements?: ReadonlyArray<string> | null | undefined;
	rehypePlugins?: PluggableList | null | undefined;
	remarkPlugins?: PluggableList | null | undefined;
	remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined;
	skipHtml?: boolean | null | undefined;
	unwrapDisallowed?: boolean | null | undefined;
	urlTransform?: UrlTransform | null | undefined;
}

export interface HooksOptions extends Options {
	fallback?: OctaneNode | null | undefined;
}
