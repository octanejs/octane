// The Canvas boundary for the home page's 3D flame. This module is the child
// of Spin.tsrx's <Hydrate> boundary, so the compiler splits it — together with
// @octanejs/three and three itself — into a deferred chunk that only loads as
// the section approaches the viewport. On the server it still renders: Canvas
// streams its DOM shell without evaluating the scene.
//
// If WebGL creation fails (or while the async renderer configuration is still
// pending after a client-side mount), the flat flame mark stands in — same
// paths, no dimension.
import { Canvas } from '@octanejs/three';
import { SpinScene } from './SpinScene.three.tsrx';
import { FLAME_CREAM, FLAME_CREAM_D, FLAME_RED, FLAME_RED_D, FLAME_VIEWBOX } from './flame.ts';

function FlatFlame() @{
	<div class="spin-flat">
		<svg viewBox={FLAME_VIEWBOX} aria-hidden="true">
			<path d={FLAME_CREAM_D} fill={FLAME_CREAM} />
			<path d={FLAME_RED_D} fill={FLAME_RED} />
		</svg>
		<style>
			.spin-flat {
				position: absolute;
				inset: 0;
				display: grid;
				place-items: center;
			}
			.spin-flat svg {
				width: min(38%, 11rem);
				height: auto;
				filter: drop-shadow(0 1.5rem 3rem rgba(255, 65, 90, 0.25));
			}
		</style>
	</div>
}

export function SpinStage() @{
	<div class="spin-stage">
		@try {
			<Canvas
				camera={{ position: [0, 0, 175], fov: 38 }}
				dpr={[1, 2]}
				style={{ width: '100%', height: '100%' }}
			>
				<SpinScene />
			</Canvas>
		} @pending {
			<FlatFlame />
		} @catch (error) {
			<FlatFlame />
		}
		<style>
			.spin-stage {
				position: relative;
				width: 100%;
				height: 100%;
			}
		</style>
	</div>
}
