declare global {
	namespace React {
		type ReactNode = unknown;
		type CSSProperties = Record<string, string | number | undefined>;
		type ElementType = string | ((props: never) => unknown);
	}
}

declare module 'react' {
	export type ReactNode = React.ReactNode;
	export type CSSProperties = React.CSSProperties;
	export type ElementType = React.ElementType;
	const ReactNS: {
		createElement: (...args: never[]) => unknown;
	};
	export default ReactNS;
}

export {};
