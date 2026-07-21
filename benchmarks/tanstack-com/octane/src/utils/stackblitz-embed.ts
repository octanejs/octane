import type { IframeHTMLAttributes } from 'octane';

export const stackBlitzEmbedHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'credentialless',
} as const;

export const stackBlitzIframeProps = {
	allow: 'cross-origin-isolated',
	credentialless: '',
} as IframeHTMLAttributes<HTMLIFrameElement> & {
	credentialless: string;
};
