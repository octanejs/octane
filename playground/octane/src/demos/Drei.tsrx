import { Canvas } from '@octanejs/three';
import { DreiScene } from './Drei.three.tsrx';

export function DreiDemo() @{
	<div>
		<h2 class="demo-title">Drei on Octane</h2>
		<p class="demo-blurb">
			Drag to orbit a scene composed with the full @octanejs/drei binding.
		</p>
		<div
			data-drei-playground="ready"
			style={{
				height: 'min(62vh, 560px)',
				minHeight: '360px',
				overflow: 'hidden',
				borderRadius: '12px',
			}}
		>
			<Canvas camera={{ position: [4, 3, 6], fov: 45 }} dpr={[1, 2]}>
				<DreiScene />
			</Canvas>
		</div>
	</div>
}
