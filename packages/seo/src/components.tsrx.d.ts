import type { ComponentBody, OctaneNode } from 'octane';
import type { MetaAttributes } from './descriptors.js';
import type { SeoInput } from './expand.js';

export declare const Head: ComponentBody<{ children?: OctaneNode }>;
export declare const Title: ComponentBody<{ text?: string; children?: string }>;
export declare const Meta: ComponentBody<MetaAttributes & { seoKey?: string }>;
export declare const Link: ComponentBody<MetaAttributes & { seoKey?: string }>;
export declare const Script: ComponentBody<{
	type?: string;
	json?: unknown;
	text?: string;
	seoKey?: string;
	[attr: string]: unknown;
}>;
export declare const JsonLd: ComponentBody<{ data: unknown; seoKey?: string }>;
export declare const Seo: ComponentBody<SeoInput>;
