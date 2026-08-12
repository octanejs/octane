import { MeshTransmissionMaterial } from '@octanejs/drei';

export function MeshTransmissionMaterialScene(props) @{
	<mesh ref={props.meshRef} name="transmission-parent">
		<boxGeometry />
		<MeshTransmissionMaterial
			ref={props.materialRef}
			transmissionSampler={props.transmissionSampler}
			backside={props.backside}
			backsideThickness={props.backsideThickness}
			backsideEnvMapIntensity={props.backsideEnvMapIntensity}
			samples={props.samples}
			resolution={props.resolution}
			backsideResolution={props.backsideResolution}
			background={props.background}
			transmission={props.transmission}
			thickness={props.thickness}
			anisotropy={props.anisotropy}
			chromaticAberration={props.chromaticAberration}
			distortion={props.distortion}
		/>
	</mesh>
}
