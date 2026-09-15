import { animate, motion, MotionConfig, useMotionValue } from '@octanejs/motion';
import { createPortal, useState } from 'octane';
import { InteractiveFilterTree } from '../../_fixtures/config.tsrx';
import { SvgContractBox } from '../../_fixtures/host-contracts.tsrx';

export function BrowserMotion() @{
	const opacity = useMotionValue(0.2);
	const [portalClicks, setPortalClicks] = useState(0);
	<div>
		<InteractiveFilterTree />
		<SvgContractBox />
		<span id="portal-clicks">{String(portalClicks)}</span>
		<MotionConfig isValidProp={(key: string) => key !== 'data-private'}>{createPortal(
			<motion.button
				id="portal-button"
				data-private="private"
				onClick={() => setPortalClicks(portalClicks + 1)}
			>{'portal'}</motion.button>,
			document.getElementById('portal-target')!,
		)}</MotionConfig>
		<motion.div id="animated" style={{ opacity }}>{'animated'}</motion.div>
		<button
			id="animate"
			onClick={() => animate(opacity, 1, { duration: 0.05 })}
		>{'animate'}</button>
	</div>
}
