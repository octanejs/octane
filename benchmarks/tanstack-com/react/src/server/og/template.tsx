import type { ReactElement } from 'react';

type TemplateProps = {
	libraryName: string;
	accentColor: string;
	islandSrc: string;
	pitch: string;
	docTitle?: string;
	description?: string;
};

const WIDTH = 1200;
const HEIGHT = 630;
const ISLAND_SIZE = Math.round(HEIGHT * 0.72);

// "TanStack AI" → ["TanStack", "AI"]
// "TanStack Router" → ["TanStack", "Router"]
// "Create TS Router App" → ["Create TS Router", "App"] (fallback: last word)
function splitName(name: string): [string, string] {
	const parts = name.split(' ');
	if (parts.length < 2) return [name, ''];
	const last = parts[parts.length - 1];
	const first = parts.slice(0, -1).join(' ');
	return [first, last];
}

export function buildOgTree(props: TemplateProps): ReactElement {
	const [titleLine1, titleLine2] = splitName(props.libraryName);

	return (
		<div
			style={{
				width: WIDTH,
				height: HEIGHT,
				display: 'flex',
				position: 'relative',
				color: '#ffffff',
				fontFamily: 'Inter',
				// Layered background: base gradient + green anchor + accent glow.
				backgroundImage: [
					`radial-gradient(circle at 100% 100%, ${hexToRgba(props.accentColor, 0.32)} 0%, transparent 55%)`,
					`radial-gradient(circle at 8% 50%, rgba(0, 188, 125, 0.28) 0%, transparent 50%)`,
					`linear-gradient(135deg, #0c1410 0%, #070a0a 55%, #0c070f 100%)`,
				].join(', '),
			}}
		>
			{/* Island */}
			<img
				src={props.islandSrc}
				alt=""
				width={ISLAND_SIZE}
				height={ISLAND_SIZE}
				style={{
					position: 'absolute',
					left: Math.round(WIDTH * 0.03),
					top: Math.round((HEIGHT - ISLAND_SIZE) / 2),
				}}
			/>

			{/* Text column */}
			<div
				style={{
					position: 'absolute',
					left: Math.round(WIDTH * 0.46),
					right: Math.round(WIDTH * 0.05),
					top: 0,
					bottom: 0,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
				}}
			>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						marginBottom: 22,
						lineHeight: 0.95,
						fontWeight: 900,
						letterSpacing: '-3px',
						textTransform: 'uppercase',
					}}
				>
					<span style={{ fontSize: 72, color: '#ffffff' }}>{titleLine1}</span>
					{titleLine2 ? (
						<span style={{ fontSize: 96, color: props.accentColor }}>{titleLine2}</span>
					) : null}
				</div>
				{!props.docTitle && !props.description && props.pitch ? (
					<div
						style={{
							fontSize: 28,
							fontWeight: 500,
							lineHeight: 1.3,
							color: '#ffffff',
							marginBottom: 0,
						}}
					>
						{props.pitch}
					</div>
				) : null}
				{props.docTitle ? (
					<div
						style={{
							fontSize: 44,
							fontWeight: 800,
							lineHeight: 1.05,
							letterSpacing: '-0.015em',
							marginBottom: 14,
							color: '#ffffff',
						}}
					>
						{props.docTitle}
					</div>
				) : null}
				{props.description ? (
					<div
						style={{
							fontSize: 22,
							lineHeight: 1.3,
							fontWeight: 500,
							color: '#ffffff',
						}}
					>
						{props.description}
					</div>
				) : null}
			</div>
		</div>
	);
}

function hexToRgba(hex: string, alpha: number): string {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
