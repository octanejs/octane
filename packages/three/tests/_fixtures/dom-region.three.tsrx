import { DOMRegion } from '@octanejs/three';
import { useLayoutEffect, useState as useThreeState } from '@octanejs/three/renderer';
import { DOMCounter, DOMRegionTheme } from './dom-region-content.tsrx';

export function DOMRegionScene(props) @{
	const [domEffectCount, setDOMEffectCount] = useThreeState(0);
	const [effectToken, setEffectToken] = useThreeState(props.effectToken);
	useLayoutEffect(() => props.captureEffectToken?.(setEffectToken), [
		props.captureEffectToken,
		setEffectToken,
	]);
	<DOMRegionTheme.Provider value={props.theme}>
		<group name={'dom-effect-' + domEffectCount}>
			@for (const item of props.order; key item) {
				@switch (item) {
					@case 'region': {
						@if (props.show) {
							<DOMRegion target={props.target}>
								<DOMCounter
									label={props.label}
									buttonRef={props.buttonRef}
									onLayout={props.onLayout}
									onCleanup={props.onCleanup}
									effectToken={effectToken}
									onEffect={() => {
										if (effectToken === 'increment') {
											setDOMEffectCount((value) => value + 1);
										}
									}}
								/>
							</DOMRegion>
						}
					}
					@default: {
						<group name={item} />
					}
				}
			}
			@if (props.reject) {
				<primitive object={props.rejectedObject} attach="missing-path" />
			}
		</group>
	</DOMRegionTheme.Provider>
}
