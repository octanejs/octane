import * as stylex from '@octane-ts/stylex';
import { Link } from '@octane-ts/router';
import { useSuspenseQuery } from '@octane-ts/query';
import { Suspense } from 'octane';
import { itemQuery } from '../shared/queries.ts';
import { styles } from '../shared/styles.ts';
import { relativeTime } from '../shared/format.ts';

const MAX_DEPTH = 6;

export function Comment({ id, depth }: { id: number; depth: number }) {
	// Each comment is its own suspense-y unit: it fetches its own item and
	// recurses into its kids (each wrapped in its own <Suspense>).
	const { data } = useSuspenseQuery(itemQuery(id));

	if (data.deleted || data.dead) return null;

	const kids = data.kids ?? [];
	return (
		<div data-testid="comment" {...stylex.props(styles.comment)}>
			<div {...stylex.props(styles.commentMeta)}>
				<Link
					to="/user/$id"
					params={{ id: data.by ?? '' }}
					data-testid="user-link"
					{...stylex.props(styles.metaLink)}
				>
					{data.by}
				</Link>
				{' ' + relativeTime(data.time)}
			</div>
			<div {...stylex.props(styles.commentText)} innerHTML={data.text ?? ''} />
			{depth < MAX_DEPTH &&
				kids.map((kid) => (
					<Suspense key={kid} fallback={<div {...stylex.props(styles.comment)}>…</div>}>
						<Comment id={kid} depth={depth + 1} />
					</Suspense>
				))}
		</div>
	);
}
