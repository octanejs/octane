import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { githubContentCache } from '../src/db/schema';

async function main() {
	const repo = 'tanstack/router';
	const gitRef = 'main';

	console.log(`\n=== ${repo}@${gitRef} ===`);

	const [{ total }] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(githubContentCache)
		.where(and(eq(githubContentCache.repo, repo), eq(githubContentCache.gitRef, gitRef)));
	console.log(`total: ${total}`);

	console.log('\nby contentKind:');
	const byKind = await db
		.select({
			kind: githubContentCache.contentKind,
			rows: sql<number>`count(*)::int`,
			present: sql<number>`count(*) filter (where ${githubContentCache.isPresent})::int`,
			absent: sql<number>`count(*) filter (where not ${githubContentCache.isPresent})::int`,
		})
		.from(githubContentCache)
		.where(and(eq(githubContentCache.repo, repo), eq(githubContentCache.gitRef, gitRef)))
		.groupBy(githubContentCache.contentKind);
	console.table(byKind);

	console.log('\ntop-level path segment distribution:');
	const byTopSegment = await db.execute(sql`
    select
      content_kind,
      split_part(path, '/', 1) as top,
      count(*)::int as rows
    from github_content_cache
    where repo = ${repo} and git_ref = ${gitRef}
    group by content_kind, top
    order by count(*) desc
    limit 30
  `);
	console.table(byTopSegment);

	console.log('\nfile extension distribution (file kind only):');
	const byExt = await db.execute(sql`
    select
      case
        when path ~ '\\.[a-zA-Z0-9]+$' then regexp_replace(path, '.*\\.([a-zA-Z0-9]+)$', '\\1')
        else '(none)'
      end as ext,
      count(*)::int as rows
    from github_content_cache
    where repo = ${repo} and git_ref = ${gitRef} and content_kind = 'file'
    group by ext
    order by count(*) desc
    limit 30
  `);
	console.table(byExt);

	console.log('\nsample 20 random file paths:');
	const samples = await db.execute(sql`
    select path, is_present, length(coalesce(text_content, '')) as text_len
    from github_content_cache
    where repo = ${repo} and git_ref = ${gitRef} and content_kind = 'file'
    order by random()
    limit 20
  `);
	console.table(samples);

	console.log('\nsample 10 random dir paths:');
	const dirSamples = await db.execute(sql`
    select path, is_present, jsonb_array_length(coalesce(json_content, '[]'::jsonb)) as entries
    from github_content_cache
    where repo = ${repo} and git_ref = ${gitRef} and content_kind = 'dir'
    order by random()
    limit 10
  `);
	console.table(dirSamples);

	console.log('\npath length distribution:');
	const lenBuckets = await db.execute(sql`
    select
      case
        when length(path) < 50 then '< 50'
        when length(path) < 100 then '50-100'
        when length(path) < 200 then '100-200'
        when length(path) < 500 then '200-500'
        else '500+'
      end as bucket,
      count(*)::int as rows
    from github_content_cache
    where repo = ${repo} and git_ref = ${gitRef}
    group by bucket
    order by min(length(path))
  `);
	console.table(lenBuckets);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
