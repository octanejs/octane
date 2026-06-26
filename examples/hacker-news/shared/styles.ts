// Shared StyleX style maps — compiled to atomic CSS at build time by the
// @octane-ts/stylex vite plugin. Spread with `{...stylex.props(styles.x)}` in
// BOTH the .tsx and .tsrx components (octane maps className -> class).
//
// StyleX restricts shorthands: use LONGHANDS (backgroundColor, paddingTop,
// borderBottomWidth, …) — never `background`, `padding: '4px 8px'`, `border`.
import * as stylex from '@octane-ts/stylex';

const ORANGE = '#ff6600';
const BG = '#f6f6ef';
const MUTED = '#828282';
const LINK = '#000000';
const PANEL = '#ffffff';
const BORDER = '#e4e4dc';

export const styles = stylex.create({
	app: {
		fontFamily: 'Verdana, Geneva, sans-serif',
		fontSize: 13,
		color: LINK,
		backgroundColor: BG,
		minHeight: '100vh',
		marginTop: 0,
		marginRight: 'auto',
		marginBottom: 0,
		marginLeft: 'auto',
		maxWidth: 960,
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		columnGap: 8,
		backgroundColor: ORANGE,
		paddingTop: 6,
		paddingRight: 8,
		paddingBottom: 6,
		paddingLeft: 8,
	},
	logo: {
		fontWeight: 700,
		color: PANEL,
		textDecoration: 'none',
	},
	headerLink: {
		color: PANEL,
		textDecoration: 'none',
		fontSize: 12,
	},
	main: {
		paddingTop: 8,
		paddingRight: 8,
		paddingBottom: 24,
		paddingLeft: 8,
		backgroundColor: PANEL,
	},
	row: {
		display: 'flex',
		alignItems: 'baseline',
		columnGap: 6,
		paddingTop: 4,
		paddingBottom: 4,
	},
	rank: {
		color: MUTED,
		minWidth: 28,
		textAlign: 'right',
	},
	titleLink: {
		color: LINK,
		textDecoration: 'none',
		fontSize: 14,
	},
	host: {
		color: MUTED,
		fontSize: 11,
	},
	meta: {
		color: MUTED,
		fontSize: 11,
		paddingLeft: 34,
	},
	metaLink: {
		color: MUTED,
		textDecoration: 'none',
	},
	storyTitle: {
		fontSize: 18,
		fontWeight: 500,
		marginTop: 8,
		marginBottom: 4,
	},
	storyTitleLink: {
		color: LINK,
		textDecoration: 'none',
	},
	storyText: {
		fontSize: 13,
		lineHeight: 1.5,
	},
	comment: {
		borderLeftWidth: 2,
		borderLeftStyle: 'solid',
		borderLeftColor: BORDER,
		paddingLeft: 10,
		marginTop: 10,
	},
	commentMeta: {
		color: MUTED,
		fontSize: 11,
		marginBottom: 4,
	},
	commentText: {
		fontSize: 13,
		lineHeight: 1.5,
		overflowWrap: 'break-word',
	},
	user: {
		paddingTop: 8,
	},
	userRow: {
		display: 'flex',
		columnGap: 8,
		paddingTop: 2,
		paddingBottom: 2,
	},
	label: {
		color: MUTED,
		minWidth: 64,
	},
	link: {
		color: LINK,
	},
	state: {
		color: MUTED,
		paddingTop: 12,
		paddingBottom: 12,
	},
	error: {
		color: '#b30000',
		paddingTop: 12,
		paddingBottom: 12,
	},
	progress: {
		position: 'fixed',
		top: 0,
		left: 0,
		height: 2,
		width: '100%',
		backgroundColor: ORANGE,
		opacity: 0.9,
		transformOrigin: 'left',
	},
	skeleton: {
		color: MUTED,
		paddingTop: 12,
		paddingBottom: 12,
		fontStyle: 'italic',
	},
});
