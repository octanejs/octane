/** @jsxImportSource @octanejs/three/intrinsics */
import { Html } from '@octanejs/drei';
import { HtmlContent, HtmlTheme } from './html-content.tsrx';

export function HtmlScene({ htmlRef, customGeometry, raycastOccluder, ...props }) @{
	<HtmlTheme.Provider value={props.theme}>
		@if (raycastOccluder) {
			<mesh position={[0, 0, 2]}>
				<planeGeometry args={[10, 10]} />
				<meshBasicMaterial />
			</mesh>
		}
		<Html {...props} ref={htmlRef} geometry={customGeometry ? <boxGeometry /> : undefined}>
			<HtmlContent label={props.label} onMount={props.onMount} onCleanup={props.onCleanup} />
		</Html>
	</HtmlTheme.Provider>
}
