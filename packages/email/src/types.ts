import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type EmailStyle = Exclude<
	Octane.HTMLAttributes<HTMLElement>['style'],
	string | undefined
> & {
	msoPaddingAlt?: string | number;
	msoTextRaise?: string | number;
};

type EmailHTMLAttributes<Element extends HTMLElement> = Element extends HTMLAnchorElement
	? Octane.AnchorHTMLAttributes<Element>
	: Element extends HTMLImageElement
		? Octane.ImgHTMLAttributes<Element>
		: Element extends HTMLTableCellElement
			? Octane.TdHTMLAttributes<Element>
			: Element extends HTMLTableElement
				? Octane.TableHTMLAttributes<Element>
				: Element extends HTMLHtmlElement
					? Octane.HtmlHTMLAttributes<Element>
					: Octane.HTMLAttributes<Element>;

export type EmailElementProps<Element extends HTMLElement = HTMLElement> = Readonly<
	Omit<EmailHTMLAttributes<Element>, 'children' | 'style' | 'ref'> & {
		children?: OctaneNode;
		style?: EmailStyle;
		ref?: ((element: Element | null) => void) | { current: Element | null } | null;
	}
>;
