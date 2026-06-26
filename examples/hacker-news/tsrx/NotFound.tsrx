import * as stylex from '@octane-ts/stylex';
import { Link } from '@octane-ts/router';
import { styles } from '../shared/styles.ts';

export function NotFound() @{
	<div {...stylex.props(styles.state)}>
		<p>{'Page not found.'}</p>
		<Link to="/" {...stylex.props(styles.link)}>{'Back to top stories'}</Link>
	</div>
}
