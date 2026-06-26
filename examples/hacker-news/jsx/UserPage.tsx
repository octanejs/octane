import * as stylex from '@octane-ts/stylex';
import { useParams } from '@octane-ts/router';
import { useSuspenseQuery } from '@octane-ts/query';
import { userQuery } from '../shared/queries.ts';
import { styles } from '../shared/styles.ts';
import { relativeTime } from '../shared/format.ts';

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
