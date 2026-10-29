/** goober's styled() context: the element props and the prepend flag. */
export interface GooberContext {
	p?: object;
	o?: boolean;
}

/** Compiles and injects a rule, returning its generated class name. */
export declare function css(
	this: GooberContext | void,
	tag: TemplateStringsArray | string,
	...props: Array<string | number | ((props: any) => string | number)>
): string;

/** Compiles and injects an @keyframes rule, returning its generated name. */
export declare function keyframes(
	tag: TemplateStringsArray | string,
	...props: Array<string | number>
): string;
