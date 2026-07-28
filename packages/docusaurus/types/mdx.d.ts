import type { CompileOptions } from '@mdx-js/mdx';
import type { CompileMdxOptions, CompileMdxResult } from '@octanejs/mdx/compile';

export interface DocusaurusTocItem {
	value: string;
	id: string;
	level: number;
}

export interface DocusaurusMarkdownLinkInput {
	linkPathname: string;
	sourceFilePath: string;
}

export interface DocusaurusMdxImageTransformInput {
	url: string;
	sourceFilePath: string;
}

export interface DocusaurusMdxAssetInput {
	frontMatter: Record<string, unknown>;
	filePath: string;
}

export interface CompileDocusaurusMdxOptions extends Omit<
	CompileMdxOptions,
	'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'
> {
	metadata?: Record<string, any>;
	createAssets?(input: DocusaurusMdxAssetInput): Record<string, any>;
	resolveMarkdownLink?(input: DocusaurusMarkdownLinkInput): string | null;
	resolveMarkdownImage?(input: DocusaurusMdxImageTransformInput): string;
	removeContentTitle?: boolean;
	anchorsMaintainCase?: boolean;
	tocMinHeadingLevel?: number;
	tocMaxHeadingLevel?: number;
	beforeDefaultRemarkPlugins?: CompileOptions['remarkPlugins'];
	remarkPlugins?: CompileOptions['remarkPlugins'];
	beforeDefaultRehypePlugins?: CompileOptions['rehypePlugins'];
	rehypePlugins?: CompileOptions['rehypePlugins'];
	recmaPlugins?: CompileOptions['recmaPlugins'];
}

export declare function remarkDocusaurusPageData(
	options?: CompileDocusaurusMdxOptions,
): (tree: any, file: any) => void;

export declare function recmaDocusaurusPageExports(): (tree: any, file: any) => void;

export declare function compileDocusaurusMdx(
	source: string,
	id: string,
	options?: CompileDocusaurusMdxOptions,
): Promise<CompileMdxResult>;

export declare function compileDocusaurusMdxSync(
	source: string,
	id: string,
	options?: CompileDocusaurusMdxOptions,
): CompileMdxResult;
