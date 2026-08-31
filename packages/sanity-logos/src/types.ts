export interface SanityLogoRefObject {
	current: SVGSVGElement | null;
}

export type SanityLogoRef =
	| SanityLogoRefObject
	| ((instance: SVGSVGElement | null) => void)
	| readonly SanityLogoRef[]
	| null;

export interface SanityLogoSvgProps {
	[key: string]: any;
	children?: unknown;
	class?: unknown;
	className?: string;
	height?: string | number;
	id?: string;
	onClick?: (event: MouseEvent) => void;
	ref?: SanityLogoRef;
	role?: string;
	style?: string | Record<string, string | number | null | undefined>;
	width?: string | number;
}

export interface SanityLogoProps extends SanityLogoSvgProps {
	dark?: boolean;
}

export type SanityMonogramScheme = 'light' | 'dark' | 'default';

/** @deprecated Prefer the scheme prop. */
export interface SanityMonogramColor {
	bg1: string;
	bg2: string;
	fg: string;
}

export type SanityMonogramProps = SanityLogoSvgProps &
	(
		| { color: SanityMonogramColor; scheme?: undefined }
		| { color?: undefined; scheme: SanityMonogramScheme }
		| { color?: undefined; scheme?: undefined }
	);
