declare module '*.tsrx' {
	export const App: (props: { params: Record<string, string>; url: string }) => unknown;
}
