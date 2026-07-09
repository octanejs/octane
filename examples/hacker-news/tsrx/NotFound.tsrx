import * as stylex from '@octanejs/stylex';
import { Link } from '@octanejs/tanstack-router';
import { styles } from '../shared/styles.js';

export function NotFound() @{
	<div {...stylex.props(styles.state)}>
		<p>{'Page not found.'}</p>
		<Link to="/" {...stylex.props(styles.link)}>{'Back to top stories'}</Link>
	</div>
}
