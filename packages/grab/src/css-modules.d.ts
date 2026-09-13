declare module '*.css';
declare module '*.css?raw' {
	const cssText: string;
	export default cssText;
}
