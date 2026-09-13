export type ReactNode = unknown;
export type CSSProperties = Record<string, string | number | undefined>;
export type ElementType = string | ((props: never) => unknown);

declare global {
	namespace React {
		type ReactNode = import('./react-module.js').ReactNode;
		type CSSProperties = import('./react-module.js').CSSProperties;
		type ElementType = import('./react-module.js').ElementType;
	}
}

const ReactNS = {
	createElement: (..._args: never[]) => null as unknown,
};
export default ReactNS;
