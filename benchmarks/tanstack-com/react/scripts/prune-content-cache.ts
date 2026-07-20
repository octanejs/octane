import { pruneStaleCacheRows } from '../src/utils/github-content-cache.server';

async function main() {
	const startTime = Date.now();
	console.log('[prune-content-cache] Starting prune...');

	const result = await pruneStaleCacheRows();
	const duration = Date.now() - startTime;

	console.log(
		`[prune-content-cache] ✓ Completed in ${duration}ms - deleted ${result.githubContentDeleted} content entries, ${result.docsArtifactDeleted} artifact entries (cutoff: ${result.cutoff.toISOString()})`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[prune-content-cache] ✗ Failed:', err);
		process.exit(1);
	});
