export function createMockR2Bucket() {
	const objects = new Map<
		string,
		{
			customMetadata?: Record<string, string>;
			uploaded: Date;
			value: string;
		}
	>();

	const bucket = {
		async delete(keys: string | Array<string>) {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				objects.delete(key);
			}
		},
		async get(key: string) {
			const object = objects.get(key);

			if (!object) {
				return null;
			}

			return {
				key,
				customMetadata: object.customMetadata,
				text: async () => object.value,
				uploaded: object.uploaded,
			};
		},
		async list(options?: {
			cursor?: string;
			include?: Array<'customMetadata'>;
			limit?: number;
			prefix?: string;
		}) {
			const prefix = options?.prefix ?? '';
			const limit = options?.limit ?? 1000;
			const entries = Array.from(objects.entries()).filter(([key]) => key.startsWith(prefix));

			return {
				objects: entries.slice(0, limit).map(([key, object]) => ({
					key,
					customMetadata: object.customMetadata,
					uploaded: object.uploaded,
				})),
				truncated: entries.length > limit,
			};
		},
		async put(
			key: string,
			value: string,
			options?: {
				customMetadata?: Record<string, string>;
				httpMetadata?: {
					contentType?: string;
				};
			},
		) {
			objects.set(key, {
				customMetadata: options?.customMetadata,
				uploaded: new Date(),
				value,
			});
		},
	};

	return { bucket, objects };
}
