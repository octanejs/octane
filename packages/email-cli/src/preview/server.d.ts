export type PreviewServerOptions = {
	directory?: string;
	host?: string;
	port?: number;
	logLevel?: 'error' | 'warn' | 'info' | 'silent';
};

/** Start an Octane-native development server for `.tsrx` email templates. */
export function startPreviewServer(options?: PreviewServerOptions): Promise<{
	url: string;
	close(): Promise<void>;
}>;
