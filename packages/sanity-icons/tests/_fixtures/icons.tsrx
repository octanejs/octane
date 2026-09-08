import { ColorWheelIcon } from '@octanejs/sanity-icons/ColorWheel';
import { RocketIcon } from '@octanejs/sanity-icons/Rocket';

export function SanityIconGallery(
	props: {
		onRocketClick?: (event: MouseEvent) => void;
		onRocketRef?: (node: SVGSVGElement | null) => void;
	} = {},
) @{
	<section>
		<RocketIcon
			id="rocket"
			className="launch-icon"
			color="rebeccapurple"
			aria-label="Launch"
			data-kind="action"
			onClick={props.onRocketClick}
			ref={props.onRocketRef}
		/>
		<ColorWheelIcon id="color-wheel" width={32} height={32} aria-hidden="true" />
	</section>
}
