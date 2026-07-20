import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
	console.log('\n=== preview prune impact ===');

	const before = await db.execute(sql`
    select
      count(*)::int as total_rows,
      count(*) filter (where is_present)::int as present_rows,
      count(*) filter (where not is_present)::int as absent_rows,
      count(*) filter (where not is_present and updated_at < now() - interval '1 day')::int as absent_older_than_1d,
      count(*) filter (where updated_at < now() - interval '30 days')::int as any_older_than_30d
    from github_content_cache
  `);
	console.table(before);

	console.log('\nbreakdown of absent rows by repo (top 20):');
	const byRepo = await db.execute(sql`
    select repo, count(*)::int as absent_rows
    from github_content_cache
    where not is_present and updated_at < now() - interval '1 day'
    group by repo
    order by count(*) desc
    limit 20
  `);
	console.table(byRepo);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
