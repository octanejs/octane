import { useRef, useState, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { IslandData } from '../utils/islandGenerator';
import { getLibraryColor } from '../utils/colors';
import { set3DObjectClicked } from '../ui/TouchControls';
import { trackEvent } from '~/utils/analytics';

interface IslandInfo3DProps {
	island: IslandData;
	exiting?: boolean;
}

const FRAMEWORK_COLORS: Record<string, string> = {
	react: '#61DAFB',
	vue: '#4FC08D',
	solid: '#2C4F7C',
	svelte: '#FF3E00',
	angular: '#DD0031',
	lit: '#325CCC',
	qwik: '#18B6F6',
	preact: '#673AB8',
	vanilla: '#F7DF1E',
};

export function IslandInfo3D({ island, exiting = false }: IslandInfo3DProps) {
	const groupRef = useRef<THREE.Group>(null);
	const scaleRef = useRef(0);
	const velocityRef = useRef(0);
	const [hovered, setHovered] = useState(false);
	const { library, partner, position } = island;

	const color =
		island.type === 'library' && library
			? getLibraryColor(library.id)
			: island.type === 'partner' && partner?.brandColor
				? partner.brandColor
				: island.type === 'partner'
					? '#f59e0b'
					: '#8b5cf6';

	const name = library?.name ?? partner?.name ?? 'Unknown';
	const tagline = library?.tagline ?? 'Partner Island';
	const isPartner = island.type === 'partner' && !!partner;

	const handleClick = () => {
		if (partner?.href) {
			let destinationHost: string | undefined;
			try {
				destinationHost = new URL(partner.href).host;
			} catch {
				// Bad/relative href — track without host rather than dropping.
			}
			trackEvent('partner_clicked', {
				partner_id: partner.id,
				placement: 'ecosystem_game',
				destination: 'external',
				destination_host: destinationHost,
			});
			window.open(partner.href, '_blank');
		} else if (library) {
			window.location.href = `/${library.id}`;
		}
	};

	useFrame((state, delta) => {
		if (groupRef.current) {
			const t = state.clock.elapsedTime;

			// Spring animation for scale (bounce in/out)
			const target = exiting ? 0 : 1;
			const stiffness = exiting ? 300 : 180;
			const damping = exiting ? 20 : 12;

			const displacement = scaleRef.current - target;
			const springForce = -stiffness * displacement;
			const dampingForce = -damping * velocityRef.current;
			const acceleration = springForce + dampingForce;

			velocityRef.current += acceleration * delta;
			scaleRef.current += velocityRef.current * delta;

			// Clamp to prevent overshoot issues
			scaleRef.current = Math.max(0, Math.min(1.2, scaleRef.current));

			groupRef.current.scale.setScalar(scaleRef.current);

			// Bob animation
			groupRef.current.position.y = 2.8 + Math.sin(t * 1.5) * 0.1;
		}
	});

	const infoPos: [number, number, number] = [
		position[0] + 1,
		position[1] + 0.5 + island.scale * 1.5,
		position[2] + 1,
	];

	return (
		<group position={infoPos}>
			<group
				ref={groupRef}
				rotation={[-Math.PI * 0.12, Math.PI * 0.25, Math.PI * 0.1]}
				scale={0}
				onClick={handleClick}
				onPointerDown={() => set3DObjectClicked()}
				onPointerOver={() => {
					setHovered(true);
					document.body.style.cursor = 'pointer';
				}}
				onPointerOut={() => {
					setHovered(false);
					document.body.style.cursor = 'auto';
				}}
			>
				<mesh position={[0, 0, -0.1]}>
					<RoundedBoxGeometry args={[5.2, 2.4, 0.15]} radius={0.25} smoothness={4} />
					<meshStandardMaterial color="#FFFFFF" transparent opacity={hovered ? 0.5 : 0.3} />
				</mesh>

				<mesh position={[0, 0, 0]}>
					<boxGeometry args={[5, 2.2, 0.15]} />
					<meshStandardMaterial
						color={color}
						transparent
						opacity={0.95}
						emissive={hovered ? color : '#000000'}
						emissiveIntensity={hovered ? 0.2 : 0}
					/>
				</mesh>

				{/* Name */}
				<Suspense fallback={null}>
					<Text
						position={[0, 0.6, 0.1]}
						fontSize={0.4}
						color="#FFFFFF"
						anchorX="center"
						anchorY="middle"
						fontWeight={700}
						maxWidth={4.5}
					>
						{name}
					</Text>
				</Suspense>

				{/* Badge for libraries */}
				{library?.badge && (
					<group position={[2.2, 0.9, 0.1]}>
						<mesh>
							<boxGeometry args={[0.7, 0.3, 0.08]} />
							<meshStandardMaterial color="#FFFFFF" transparent opacity={0.3} />
						</mesh>
						<Suspense fallback={null}>
							<Text
								position={[0, 0, 0.05]}
								fontSize={0.15}
								color="#FFFFFF"
								anchorX="center"
								anchorY="middle"
								fontWeight={600}
							>
								{library.badge.toUpperCase()}
							</Text>
						</Suspense>
					</group>
				)}

				{/* Tagline */}
				<Suspense fallback={null}>
					<Text
						position={[0, 0, 0.1]}
						fontSize={0.18}
						color="#FFFFFF"
						anchorX="center"
						anchorY="middle"
						maxWidth={4.2}
						textAlign="center"
						lineHeight={1.3}
					>
						{hovered ? (isPartner ? 'Click to visit' : 'Click to visit docs') : tagline}
					</Text>
				</Suspense>

				{library?.frameworks && library.frameworks.length > 0 && (
					<group position={[0, -0.7, 0]}>
						{(() => {
							const frameworks = library.frameworks!.slice(0, 6);
							const gap = 0.08;
							const paddingX = 0.12;
							const charWidth = 0.1;
							const boxHeight = 0.28;

							// Calculate widths for each framework
							const widths = frameworks.map((fw) => {
								const label = fw.charAt(0).toUpperCase() + fw.slice(1);
								return label.length * charWidth + paddingX * 2;
							});

							const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (frameworks.length - 1);
							let currentX = -totalWidth / 2;

							return frameworks.map((fw, i) => {
								const label = fw.charAt(0).toUpperCase() + fw.slice(1);
								const boxWidth = widths[i];
								const x = currentX + boxWidth / 2;
								currentX += boxWidth + gap;

								return (
									<group key={fw} position={[x, 0, 0.1]}>
										<mesh>
											<boxGeometry args={[boxWidth, boxHeight, 0.08]} />
											<meshStandardMaterial
												color={FRAMEWORK_COLORS[fw] || '#888888'}
												transparent
												opacity={0.9}
											/>
										</mesh>
										<Suspense fallback={null}>
											<Text
												position={[0, 0, 0.05]}
												fontSize={0.12}
												color="#FFFFFF"
												anchorX="center"
												anchorY="middle"
												fontWeight={600}
												maxWidth={boxWidth - 0.04}
												overflowWrap="normal"
												whiteSpace="nowrap"
											>
												{label}
											</Text>
										</Suspense>
									</group>
								);
							});
						})()}
					</group>
				)}
			</group>
		</group>
	);
}
