export function createPublishManifest(manifest: Record<string, unknown>): Record<string, unknown>;

export function packPackage(
	directory: string,
	destination: string,
	options?: { root?: string },
): { archive: string; manifest: Record<string, unknown> };
