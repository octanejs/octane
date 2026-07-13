import { Camera, CircleAlert, Icon, LucideProvider, Search } from '@octanejs/lucide';

const customNode = [
	['circle', { cx: '12', cy: '12', r: '9', key: 'outer' }],
	['path', { d: 'm9 12 2 2 4-4', key: 'check' }],
] as const;

export function IconGallery(props: {
		onCameraClick?: (event: MouseEvent) => void;
		onCameraRef?: (node: SVGSVGElement | null) => void;
	} = {}) {
	return <section>
		<Camera
			id="camera"
			size={32}
			color="rebeccapurple"
			strokeWidth={1.5}
			className="toolbar-icon"
			data-kind="media"
			onClick={props.onCameraClick}
			ref={props.onCameraRef}
		/>
		<LucideProvider size={18} color="tomato" strokeWidth={3} className="provided">
			<Search id="search" absoluteStrokeWidth className="local" aria-label="Find" />
		</LucideProvider>
		<CircleAlert id="alert" aria-labelledby="alert-title">
			<title id="alert-title">Warning</title>
		</CircleAlert>
		<Icon id="custom" iconNode={customNode} role="img" />
	</section>;
}
