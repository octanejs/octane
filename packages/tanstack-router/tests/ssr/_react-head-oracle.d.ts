import type { ServerManifest } from '@tanstack/router-core';

export declare function renderReactHeadContent(options: {
	head: () => object;
	manifest: ServerManifest;
	nonce: string;
}): Promise<string>;
