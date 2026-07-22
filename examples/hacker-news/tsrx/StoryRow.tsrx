import * as stylex from '@octanejs/stylex';
import { Link } from '@octanejs/tanstack-router';
import { styles } from '../shared/styles.js';
import { relativeTime, hostname, pluralize } from '../shared/format.js';
import type { Story } from '../shared/types.js';

export function StoryRow({ rank, story }: { rank: number; story: Story }) @{
	const host = hostname(story.url);
	const comments = story.descendants ?? 0;

	<div data-testid="story-row">
		<div {...stylex.props(styles.row)}>
			<span {...stylex.props(styles.rank)}>{rank + '.' as string}</span>
			@if (story.url) {
				<a
					href={story.url}
					class="story-title"
					{...stylex.props(styles.titleLink)}
				>{story.title as string}</a>
			} @else {
				<Link
					to="/item/$id"
					params={{ id: String(story.id) }}
					class="story-title"
					{...stylex.props(styles.titleLink)}
				>{story.title as string}</Link>
			}
			@if (host) {
				<span {...stylex.props(styles.host)}>{'(' + host + ')' as string}</span>
			}
		</div>
		<div {...stylex.props(styles.meta)}>
			{(story.score ?? 0) + ' points by '}
			<Link
				to="/user/$id"
				params={{ id: story.by ?? '' }}
				data-testid="user-link"
				{...stylex.props(styles.metaLink)}
			>{story.by as string}</Link>
			{' ' + relativeTime(story.time) + ' | '}
			<Link
				to="/item/$id"
				params={{ id: String(story.id) }}
				data-testid="comments-link"
				{...stylex.props(styles.metaLink)}
			>
				{comments + ' ' + pluralize(comments, 'comment')}
			</Link>
		</div>
	</div>
}
