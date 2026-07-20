import * as stylex from '@octanejs/stylex';
import { useParams, Link } from '@octanejs/tanstack-router';
import { useSuspenseQuery } from '@octanejs/tanstack-query';
import { itemQuery } from '../shared/queries.js';
import { styles } from '../shared/styles.js';
import { relativeTime, hostname, pluralize } from '../shared/format.js';
import { Comment } from './Comment.tsrx';

export function ItemPage() @{
	const { id } = useParams({ strict: false });
	// Suspends to the item route's pendingComponent while the item loads.
	const { data: item } = useSuspenseQuery(itemQuery(Number(id)));

	const host = hostname(item.url);
	const comments = item.descendants ?? 0;
	const kids = item.kids ?? [];

	<div data-testid="item-page">
		<h1 {...stylex.props(styles.storyTitle)}>
			@if (item.url) {
				<a href={item.url} {...stylex.props(styles.storyTitleLink)}>
					{item.title as string}
				</a>
			} @else {
				{
					item.title as string;
				}
			}
			@if (host) {
				<span {...stylex.props(styles.host)}>
					{' (' + host + ')' as string}
				</span>
			}
		</h1>
		<div {...stylex.props(styles.meta)}>
			{(item.score ?? 0) + ' points by '}
			<Link
				to="/user/$id"
				params={{ id: item.by ?? '' }}
				data-testid="user-link"
				{...stylex.props(styles.metaLink)}
			>
				{item.by as string}
			</Link>
			{' ' + relativeTime(item.time)}
		</div>
		@if (item.text) {
			<div {...stylex.props(styles.storyText)} dangerouslySetInnerHTML={{ __html: item.text }} />
		}
		<div {...stylex.props(styles.meta)}>{comments + ' ' + pluralize(comments, 'comment')}</div>
		<div data-testid="comments">
			@for (const kid of kids; key kid) {
				@try {
					<Comment id={kid} depth={0} />
				} @pending {
					<div {...stylex.props(styles.comment)}>{'…'}</div>
				}
			}
		</div>
	</div>
}
