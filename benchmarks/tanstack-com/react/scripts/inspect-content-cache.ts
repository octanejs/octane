import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { docsArtifactCache, githubContentCache } from '../src/db/schema';

async function main() {
	console.log('\n=== github_content_cache ===');

	const [{ total }] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(githubContentCache);
	console.log(`total rows: ${total}`);

	console.log('\nby repo:');
	const byRepo = await db
		.select({
			repo: githubContentCache.repo,
			rows: sql<number>`count(*)::int`,
			refs: sql<number>`count(distinct ${githubContentCache.gitRef})::int`,
		})
		.from(githubContentCache)
		.groupBy(githubContentCache.repo)
		.orderBy(sql`count(*) desc`);
	console.table(byRepo);

	console.log('\ntop 20 (repo, gitRef) by row count:');
	const byRef = await db
		.select({
			repo: githubContentCache.repo,
			gitRef: githubContentCache.gitRef,
			rows: sql<number>`count(*)::int`,
			oldestCreated: sql<Date>`min(${githubContentCache.createdAt})`,
			newestCreated: sql<Date>`max(${githubContentCache.createdAt})`,
			newestUpdated: sql<Date>`max(${githubContentCache.updatedAt})`,
		})
		.from(githubContentCache)
		.groupBy(githubContentCache.repo, githubContentCache.gitRef)
		.orderBy(sql`count(*) desc`)
		.limit(20);
	console.table(byRef);

	console.log('\ncreatedAt age buckets:');
	const ageBuckets = await db.execute(sql`
    select
      case
        when created_at > now() - interval '1 day' then '0-1d'
        when created_at > now() - interval '7 days' then '1-7d'
        when created_at > now() - interval '30 days' then '7-30d'
        when created_at > now() - interval '90 days' then '30-90d'
        when created_at > now() - interval '180 days' then '90-180d'
        else '180d+'
      end as bucket,
      count(*)::int as rows
    from github_content_cache
    group by bucket
    order by min(created_at)
  `);
	console.table(ageBuckets);

	console.log('\n=== docs_artifact_cache ===');
	const [{ totalArt }] = await db
		.select({ totalArt: sql<number>`count(*)::int` })
		.from(docsArtifactCache);
	console.log(`total rows: ${totalArt}`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
