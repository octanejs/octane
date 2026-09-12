import {
	Camera,
	CircleAlert,
	createLucideIcon,
	Icon,
	LucideProvider,
	Search,
} from './icons-runtime.js';
import type { IconNode } from '../../src/types.js';

const customNode: IconNode = [
	['circle', { cx: '12', cy: '12', r: '9', key: 'outer' }],
	['path', { d: 'm9 12 2 2 4-4', key: 'check' }],
];

const WideIcon = createLucideIcon({
	name: 'wide-badge',
	aliases: ['badge-wide'],
	width: 48,
	height: 16,
	node: [['rect', { width: 48, height: 16, key: 'body' }]],
});

export function IconGallery(
	props: {
		onCameraClick?: (event: MouseEvent) => void;
		onCameraRef?: (node: SVGSVGElement | null) => void;
	} = {},
) {
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
		<LucideProvider nonScalingStroke className="badge-provider">
			<WideIcon id="wide" width={96} height={32} className="badge" />
			<WideIcon id="wide-override" nonScalingStroke={false} />
		</LucideProvider>
	</section>;
}
