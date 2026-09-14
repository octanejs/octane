/** Nominal proof that the application explicitly accepted this HTML as trusted. */
declare const trustedHTMLBrand: unique symbol;

/**
 * HTML accepted for an intrinsic element's `dangerouslySetInnerHTML` in Strong
 * mode. The brand is type-only; client rendering and SSR use the ordinary
 * `{ __html }` representation without a per-element runtime check.
 */
export interface TrustedHTML {
	readonly __html: string;
	readonly [trustedHTMLBrand]: true;
}

/**
 * Explicitly accept HTML from a trusted source or a sanitizer the application
 * owns. This function does not sanitize, escape, or validate its input.
 */
export function trustHTML(html: string): TrustedHTML {
	return { __html: html } as TrustedHTML;
}
