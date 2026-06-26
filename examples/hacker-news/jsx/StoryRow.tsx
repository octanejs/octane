import * as stylex from '@octane-ts/stylex';
import { Link } from '@octane-ts/router';
import { styles } from '../shared/styles.ts';
import { relativeTime, hostname, pluralize } from '../shared/format.ts';
import type { Story } from '../shared/types.ts';

export function StoryRow({ rank, story }: { rank: number; story: Story }) {
	const host = hostname(story.url);
	const comments = story.descendants ?? 0;
	return (
		<div data-testid="story-row">
			<div {...stylex.props(styles.row)}>
				<span {...stylex.props(styles.rank)}>{rank}.</span>
				{story.url ? (
					<a href={story.url} className="story-title" {...stylex.props(styles.titleLink)}>
						{story.title}
					</a>
				) : (
					<Link
						to="/item/$id"
						params={{ id: String(story.id) }}
						className="story-title"
						{...stylex.props(styles.titleLink)}
					>
						{story.title}
					</Link>
				)}
				{host && <span {...stylex.props(styles.host)}>({host})</span>}
			</div>
			<div {...stylex.props(styles.meta)}>
				{(story.score ?? 0) + ' points by '}
				<Link
					to="/user/$id"
					params={{ id: story.by ?? '' }}
					data-testid="user-link"
					{...stylex.props(styles.metaLink)}
				>
					{story.by}
				</Link>
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
	);
}
