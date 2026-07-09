import * as stylex from '@octanejs/stylex';
import { Link } from '@octanejs/tanstack-router';
import { useSuspenseQuery } from '@octanejs/tanstack-query';
import { itemQuery } from '../shared/queries.js';
import { COMMENT_KIDS_LIMIT } from '../shared/routes.js';
import { styles } from '../shared/styles.js';
import { relativeTime } from '../shared/format.js';

const MAX_DEPTH = 6;

export function Comment({ id, depth }: { id: number; depth: number }) @{
	// Each comment is its own suspense-y unit: it fetches its own item and
	// recurses into its kids (each its own @try/@pending boundary).
	const { data } = useSuspenseQuery(itemQuery(id));

	// Dead/deleted comments (and the occasional missing item) render nothing.
	if (!data || data.deleted || data.dead) return null;

	// Stop recursing past MAX_DEPTH by rendering no children (an empty `@for`)
	// rather than wrapping the loop in an `@if` — keeps the suspense `@try` at the
	// loop's top level, which the SSR compiler supports. Kids are capped to
	// COMMENT_KIDS_LIMIT so the render matches the server's bounded prefetch (an
	// unprefetched comment would suspend mid-SSR and stall) — identical in both apps.
	const childIds =
		depth < MAX_DEPTH ? (data.kids ?? []).slice(0, COMMENT_KIDS_LIMIT) : [];

	<div data-testid="comment" {...stylex.props(styles.comment)}>
		<div {...stylex.props(styles.commentMeta)}>
			<Link
				to="/user/$id"
				params={{ id: data.by ?? '' }}
				data-testid="user-link"
				{...stylex.props(styles.metaLink)}
			>
				{data.by as string}
			</Link>
			{' ' + relativeTime(data.time)}
		</div>
		<div
			{...stylex.props(styles.commentText)}
			dangerouslySetInnerHTML={{ __html: data.text ?? '' }}
		/>
		@for (const kid of childIds; key kid) {
			@try {
				<Comment id={kid} depth={depth + 1} />
			} @pending {
				<div {...stylex.props(styles.comment)}>{'…'}</div>
			}
		}
	</div>
}
