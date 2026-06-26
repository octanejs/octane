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
const SKELETON = '#e0e0d8';

// Subtle pulse for skeleton placeholders while a row's item loads.
const pulse = stylex.keyframes({
	'0%': { opacity: 0.6 },
	'50%': { opacity: 1 },
	'100%': { opacity: 0.6 },
});

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
		columnGap: 6,
		rowGap: 2,
		flexWrap: 'wrap',
		backgroundColor: ORANGE,
		paddingTop: 4,
		paddingRight: 8,
		paddingBottom: 4,
		paddingLeft: 8,
	},
	// The white-bordered "Y" box, classic HN logo treatment.
	logoBox: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: 16,
		height: 16,
		borderWidth: 1,
		borderStyle: 'solid',
		borderColor: PANEL,
		color: PANEL,
		fontWeight: 700,
		fontSize: 13,
		lineHeight: 1,
		textDecoration: 'none',
	},
	// Bold "Hacker News" home link.
	logo: {
		fontWeight: 700,
		color: '#000000',
		textDecoration: 'none',
		fontSize: 13,
		marginRight: 4,
	},
	// The new | past | comments | ... nav links.
	headerLink: {
		color: '#000000',
		textDecoration: 'none',
		fontSize: 13,
	},
	// The "|" separators between nav links.
	headerSep: {
		color: '#000000',
		fontSize: 13,
		opacity: 0.6,
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
	// A single placeholder story row: a wide title bar + a thin meta bar, with a
	// subtle pulse. Used as each row's Suspense fallback and (stacked) as the
	// route-level pending skeleton.
	skeletonRow: {
		paddingTop: 6,
		paddingBottom: 6,
		animationName: pulse,
		animationDuration: '1.2s',
		animationIterationCount: 'infinite',
		animationTimingFunction: 'ease-in-out',
	},
	skeletonTitle: {
		height: 12,
		width: '60%',
		backgroundColor: SKELETON,
		borderTopLeftRadius: 2,
		borderTopRightRadius: 2,
		borderBottomLeftRadius: 2,
		borderBottomRightRadius: 2,
		marginBottom: 6,
	},
	skeletonMeta: {
		height: 8,
		width: '35%',
		backgroundColor: SKELETON,
		borderTopLeftRadius: 2,
		borderTopRightRadius: 2,
		borderBottomLeftRadius: 2,
		borderBottomRightRadius: 2,
		marginLeft: 34,
	},
});
