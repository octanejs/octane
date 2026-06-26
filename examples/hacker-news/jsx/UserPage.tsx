import * as stylex from '@octanejs/stylex';
import { useParams } from '@octanejs/router';
import { useSuspenseQuery } from '@octanejs/query';
import { userQuery } from '../shared/queries.js';
import { styles } from '../shared/styles.js';
import { relativeTime } from '../shared/format.js';

export function UserPage() {
	const { id } = useParams({ strict: false });
	// Suspends to the user route's pendingComponent while the user loads.
	const { data } = useSuspenseQuery(userQuery(id ?? ''));

	return (
		<div data-testid="user-page" {...stylex.props(styles.user)}>
			<div {...stylex.props(styles.userRow)}>
				<span {...stylex.props(styles.label)}>user:</span>
				<span>{data.id}</span>
			</div>
			<div {...stylex.props(styles.userRow)}>
				<span {...stylex.props(styles.label)}>created:</span>
				<span>{relativeTime(data.created)}</span>
			</div>
			<div {...stylex.props(styles.userRow)}>
				<span {...stylex.props(styles.label)}>karma:</span>
				<span>{data.karma}</span>
			</div>
			{data.about && (
				<div {...stylex.props(styles.userRow)}>
					<span {...stylex.props(styles.label)}>about:</span>
					<span {...stylex.props(styles.commentText)} innerHTML={data.about} />
				</div>
			)}
		</div>
	);
}
