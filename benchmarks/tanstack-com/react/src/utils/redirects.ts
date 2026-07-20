export type RedirectManifestEntry = {
	from: string;
	to: string;
	source: string;
};

export function normalizeRedirectFrom(value: unknown) {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const normalizedPaths = Array.from(
		new Set(
			value.flatMap((item) => {
				if (typeof item !== 'string') {
					return [];
				}

				const trimmedItem = item.trim();

				if (!trimmedItem) {
					return [];
				}

				return [trimmedItem.startsWith('/') ? trimmedItem : `/${trimmedItem}`];
			}),
		),
	);

	return normalizedPaths.length > 0 ? normalizedPaths : undefined;
}

export function buildRedirectManifest(
	entries: Array<RedirectManifestEntry>,
	opts: {
		label: string;
		formatTarget?: (target: string) => string;
	},
) {
	const manifest: Record<string, string> = {};
	const owners = new Map<string, { to: string; source: string }>();
	const formatTarget = opts.formatTarget ?? ((target: string) => `/${target}`);

	for (const entry of entries) {
		const existingOwner = owners.get(entry.from);

		if (existingOwner && (existingOwner.to !== entry.to || existingOwner.source !== entry.source)) {
			throw new Error(
				[
					`Duplicate redirect_from entry in ${opts.label}: /${entry.from}`,
					`- ${existingOwner.source} -> ${formatTarget(existingOwner.to)}`,
					`- ${entry.source} -> ${formatTarget(entry.to)}`,
				].join('\n'),
			);
		}

		owners.set(entry.from, { to: entry.to, source: entry.source });
		manifest[entry.from] = entry.to;
	}

	return manifest;
}
