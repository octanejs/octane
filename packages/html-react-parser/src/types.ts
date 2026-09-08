import type { DOMNode, HTMLDOMParserOptions, TrustedTypePolicy } from 'html-dom-parser';
import type { ElementDescriptor, OctaneNode } from 'octane';

export interface HTMLReactParserOptions {
	htmlparser2?: Omit<HTMLDOMParserOptions, 'trustedTypePolicy'>;
	trustedTypePolicy?: TrustedTypePolicy;

	library?: {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		cloneElement: (
			element: ElementDescriptor,
			props?: object,
			...children: any[]
		) => ElementDescriptor;

		createElement: (type: any, props?: object, ...children: any[]) => ElementDescriptor;

		isValidElement: (element: any) => boolean;

		[key: string]: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
	};

	replace?: (
		domNode: DOMNode,
		index: number,
		// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	) => ElementDescriptor | string | null | boolean | object | void;

	transform?: (
		reactNode: OctaneNode,
		domNode: DOMNode,
		index: number,
		// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	) => ElementDescriptor | string | null | void;

	trim?: boolean;
}
