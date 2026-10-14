import type { ComponentBody } from 'octane';

export interface MDXComponents {
	[name: string]: ComponentBody<any> | string | MDXComponents;
}

export type MDXComponentsProp = MDXComponents | ((inherited: MDXComponents) => MDXComponents);

export interface MDXProviderProps {
	children?: unknown;
	components?: MDXComponentsProp | null;
	disableParentContext?: boolean;
}

export interface MDXProps {
	components?: MDXComponents;
	[key: string]: unknown;
}

export declare function useMDXComponents(
	components?: MDXComponentsProp | null | symbol,
	_slot?: symbol,
): MDXComponents;

export declare function MDXProvider(props: MDXProviderProps): unknown;
