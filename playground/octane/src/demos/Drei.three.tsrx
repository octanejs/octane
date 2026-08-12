/** @jsxImportSource @octanejs/three/intrinsics */
import { Float, Grid, OrbitControls, RoundedBox, Stars } from '@octanejs/drei';

export function DreiScene() @{
	<>
		<color attach="background" args={['#090b12']} />
		<ambientLight intensity={0.8} />
		<directionalLight position={[4, 7, 5]} intensity={2.5} />
		<Stars radius={45} depth={20} count={900} factor={2.5} fade speed={0.5} />
		<Float speed={1.6} rotationIntensity={0.45} floatIntensity={0.8}>
			<RoundedBox args={[2.4, 2.4, 2.4]} radius={0.28} smoothness={6}>
				<meshStandardMaterial color="#ff5a36" roughness={0.28} metalness={0.15} />
			</RoundedBox>
		</Float>
		<Grid
			position={[0, -2, 0]}
			args={[12, 12]}
			cellColor="#34384a"
			sectionColor="#777e9e"
			fadeDistance={14}
			infiniteGrid
		/>
		<OrbitControls makeDefault enableDamping minDistance={4} maxDistance={10} />
	</>
}
