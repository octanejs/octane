import * as stylex from '@octane-ts/stylex';
import { useParams, Link } from '@octane-ts/router';
import { useSuspenseQuery } from '@octane-ts/query';
import { Suspense } from 'octane';
import { itemQuery } from '../shared/queries.js';
import { styles } from '../shared/styles.js';
import { relativeTime, hostname, pluralize } from '../shared/format.js';
import { Comment } from './Comment.js';

export function ItemPage() {
	const { id } = useParams({ strict: false });
	// Suspends to the item route's pendingComponent while the item loads.
	const { data: item } = useSuspenseQuery(itemQuery(Number(id)));

	const host = hostname(item.url);
	const comments = item.descendants ?? 0;
	const kids = item.kids ?? [];

	return (
		<div data-testid="item-page">
			<h1 {...stylex.props(styles.storyTitle)}>
				{item.url ? (
					<a href={item.url} {...stylex.props(styles.storyTitleLink)}>
						{item.title}
					</a>
				) : (
					item.title
				)}
				{host && <span {...stylex.props(styles.host)}> ({host})</span>}
			</h1>
			<div {...stylex.props(styles.meta)}>
				{(item.score ?? 0) + ' points by '}
				<Link
					to="/user/$id"
					params={{ id: item.by ?? '' }}
					data-testid="user-link"
					{...stylex.props(styles.metaLink)}
				>
					{item.by}
				</Link>
				{' ' + relativeTime(item.time)}
			</div>
			{item.text && <div {...stylex.props(styles.storyText)} innerHTML={item.text} />}
			<div {...stylex.props(styles.meta)}>{comments + ' ' + pluralize(comments, 'comment')}</div>
			<div data-testid="comments">
				{kids.map((kid) => (
					<Suspense key={kid} fallback={<div {...stylex.props(styles.comment)}>…</div>}>
						<Comment id={kid} depth={0} />
					</Suspense>
				))}
			</div>
		</div>
	);
}
