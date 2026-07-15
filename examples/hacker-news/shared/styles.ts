// Shared StyleX style maps — compiled to atomic CSS at build time by the
// @octanejs/stylex vite plugin. Spread with `{...stylex.props(styles.x)}` in
// BOTH the .tsx and .tsrx components (octane maps className -> class).
//
// StyleX restricts shorthands: use LONGHANDS (backgroundColor, paddingTop,
// borderBottomWidth, …) — never `background`, `padding: '4px 8px'`, `border`.
import * as stylex from '@octanejs/stylex';

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
		// Column layout so `main` can grow to fill the viewport — otherwise the
		// beige page background shows below a short content panel during loading.
		display: 'flex',
		flexDirection: 'column',
		marginTop: 0,
		marginRight: 'auto',
		marginBottom: 0,
		marginLeft: 'auto',
		// Match Hacker News' content width: 85% of the viewport, centered — no fixed
		// pixel cap, so it stays wide on large screens like the real site.
		width: '85%',
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
	// The nav link for the CURRENT feed — bold + underlined.
	headerLinkActive: {
		color: '#000000',
		textDecoration: 'underline',
		fontSize: 13,
		fontWeight: 700,
	},
	// The "|" separators between nav links.
	headerSep: {
		color: '#000000',
		fontSize: 13,
		opacity: 0.6,
	},
	main: {
		// Fill the height left by the header so the HN-beige content reaches the
		// bottom on short/loading pages (no seam below the list).
		flexGrow: 1,
		paddingTop: 8,
		paddingRight: 8,
		paddingBottom: 24,
		paddingLeft: 8,
		// The classic Hacker News content background (the same warm beige as the page).
		backgroundColor: BG,
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
	// The prev | page N | more pager beneath the list.
	pager: {
		display: 'flex',
		alignItems: 'baseline',
		columnGap: 12,
		marginTop: 12,
		paddingTop: 10,
		paddingLeft: 34,
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: BORDER,
		fontSize: 13,
	},
	pagerLink: {
		color: LINK,
		textDecoration: 'none',
		fontWeight: 700,
	},
	// A disabled (non-navigable) pager edge — e.g. `‹ prev` on page 1.
	pagerDisabled: {
		color: MUTED,
		opacity: 0.5,
	},
	pagerPage: {
		color: MUTED,
	},
	// Subtle dim of the list while a navigation (page change) is in flight — a
	// 'pending' cue layered on top of the top progress bar.
	listPending: {
		opacity: 0.6,
		transitionProperty: 'opacity',
		transitionDuration: '0.15s',
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
	// subtle pulse. Pending.tsx/tsrx stack these for the route-level fallback.
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
		// Align with the real title column (past the 28px rank + 6px gap), matching
		// `skeletonMeta` — so bars sit where the loaded title/meta will render.
		marginLeft: 34,
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
