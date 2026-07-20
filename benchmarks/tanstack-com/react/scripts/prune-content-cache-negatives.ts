import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { githubContentCache } from '../src/db/schema';

/**
 * One-shot cleanup: delete every negative cache row (is_present = false).
 *
 * The daily prune fn keeps negatives for 1 day going forward, but the
 * existing rows had their updated_at bumped by mark*Stale so they all
 * look fresh. They're safe to drop wholesale — anything still being
 * requested will repopulate within 15 minutes (the negative TTL), and
 * most are bogus paths that won't be requested again.
 */
async function main() {
	const startTime = Date.now();

	const [{ before }] = await db
		.select({ before: sql<number>`count(*)::int` })
		.from(githubContentCache);
	console.log(`[prune-negatives] rows before: ${before}`);

	const deleted = await db
		.delete(githubContentCache)
		.where(eq(githubContentCache.isPresent, false))
		.returning({ id: githubContentCache.id });

	const [{ after }] = await db
		.select({ after: sql<number>`count(*)::int` })
		.from(githubContentCache);

	const duration = Date.now() - startTime;
	console.log(
		`[prune-negatives] ✓ Deleted ${deleted.length} negative rows in ${duration}ms (rows after: ${after})`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[prune-negatives] ✗ Failed:', err);
		process.exit(1);
	});
