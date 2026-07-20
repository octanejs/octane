import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Decal, Environment, useGLTF, useTexture } from '@react-three/drei';
import { easing } from 'maath';

type ShopHero3DProps = {
	isDark?: boolean;
};

const BRAND_IMAGES = {
	light: [
		'/images/logos/logo-color-600.png',
		'/images/logos/logo-color-banner-600.png',
		'/images/logos/logo-black.svg',
		'/images/logos/logo-word-black.svg',
		'/images/logos/splash-light.png',
	],
	dark: [
		'/images/logos/logo-color-600.png',
		'/images/logos/logo-color-banner-600.png',
		'/images/logos/logo-white.svg',
		'/images/logos/logo-word-white.svg',
		'/images/logos/splash-dark.png',
	],
};

type Placement = {
	decal: [number, number, number];
	decalRotation?: [number, number, number];
	scale: number;
	maxWidth?: number;
	shirtPos: [number, number, number];
	shirtRot: [number, number, number];
};

const PLACEMENTS: Array<Placement> = [
	{
		// Left chest patch
		decal: [0.06, 0.16, 0.14],
		scale: 0.07,
		maxWidth: 0.1,
		shirtPos: [-0.02, -0.16, 0],
		shirtRot: [-0.03, -0.15, 0.01],
	},
	{
		// Oversized
		decal: [0, 0.02, 0.15],
		scale: 0.35,
		shirtPos: [0, -0.1, -0.25],
		shirtRot: [-0.02, -0.12, 0.01],
	},
	{
		// Right chest patch
		decal: [-0.06, 0.16, 0.14],
		scale: 0.07,
		maxWidth: 0.1,
		shirtPos: [0.02, -0.16, 0],
		shirtRot: [-0.03, 0.15, -0.01],
	},
	{
		// Back neck — high collar placement, shirt rotates to show the back
		decal: [0, 0.19, -0.1],
		decalRotation: [0, Math.PI, 0],
		scale: 0.06,
		maxWidth: 0.09,
		shirtPos: [0, -0.17, 0],
		shirtRot: [-0.03, Math.PI * 0.97, 0.01],
	},
	{
		// Left sleeve
		decal: [0.23, 0.115, -0.015],
		decalRotation: [-0.03, 1.72, -0.06],
		scale: 0.05,
		maxWidth: 0.07,
		shirtPos: [-0.13, -0.15, -0.02],
		shirtRot: [-0.23, -1.13, 0.08],
	},
];

export function ShopHero3D({ isDark = false }: ShopHero3DProps) {
	const images = isDark ? BRAND_IMAGES.dark : BRAND_IMAGES.light;

	return (
		<div className="w-full h-full relative">
			<Canvas
				camera={{ position: [0.06, 0.095, 0.45], fov: 25 }}
				gl={{
					antialias: true,
					toneMapping: THREE.ACESFilmicToneMapping,
					toneMappingExposure: 1.0,
				}}
				className="!absolute inset-0"
			>
				<Scene images={images} isDark={isDark} />
			</Canvas>
		</div>
	);
}

function Scene({ images, isDark }: { images: Array<string>; isDark: boolean }) {
	const { gl } = useThree();
	React.useEffect(() => {
		gl.setClearColor(isDark ? '#0a0a0b' : '#e8e6e4', 1);
	}, [gl, isDark]);

	return (
		<>
			<Environment preset="studio" environmentIntensity={isDark ? 0.35 : 0.85} />
			<directionalLight
				position={[-2, 3, 3]}
				intensity={isDark ? 0.3 : 0.6}
				color={isDark ? '#b8c0d0' : '#ffffff'}
			/>
			<directionalLight position={[2, -1, 2]} intensity={isDark ? 0.05 : 0.1} color="#e8e0f0" />
			<ShirtWithDecals images={images} isDark={isDark} />
		</>
	);
}

function useFabricTexture(isDark: boolean) {
	return React.useMemo(() => {
		const size = 512;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = isDark ? '#1a1a1a' : '#f8f6f4';
		ctx.fillRect(0, 0, size, size);
		const hStroke = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
		ctx.lineWidth = 1;
		for (let y = 0; y < size; y += 2) {
			ctx.strokeStyle = hStroke;
			ctx.beginPath();
			ctx.moveTo(0, y + (Math.random() - 0.5) * 0.6);
			ctx.lineTo(size, y + (Math.random() - 0.5) * 0.6);
			ctx.stroke();
		}
		const vStroke = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
		for (let x = 0; x < size; x += 2) {
			ctx.strokeStyle = vStroke;
			ctx.beginPath();
			ctx.moveTo(x + (Math.random() - 0.5) * 0.6, 0);
			ctx.lineTo(x + (Math.random() - 0.5) * 0.6, size);
			ctx.stroke();
		}
		const imageData = ctx.getImageData(0, 0, size, size);
		const { data } = imageData;
		for (let i = 0; i < data.length; i += 4) {
			const noise = (Math.random() - 0.5) * 14;
			data[i] = Math.min(255, Math.max(0, data[i]! + noise));
			data[i + 1] = Math.min(255, Math.max(0, data[i + 1]! + noise));
			data[i + 2] = Math.min(255, Math.max(0, data[i + 2]! + noise));
		}
		ctx.putImageData(imageData, 0, 0);
		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(20, 20);
		texture.anisotropy = 8;
		return texture;
	}, [isDark]);
}

function useBumpTexture() {
	return React.useMemo(() => {
		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d')!;

		// Mid-gray base
		ctx.fillStyle = '#808080';
		ctx.fillRect(0, 0, size, size);

		// Draw a jersey-knit V pattern — interlocking V shapes that mimic
		// the face side of a knit cotton tee
		const stitchW = 5; // width of one stitch column
		const stitchH = 6; // height of one stitch row
		ctx.lineWidth = 1.5;
		ctx.lineCap = 'round';

		for (let row = 0; row < size / stitchH + 1; row++) {
			for (let col = 0; col < size / stitchW + 1; col++) {
				const x = col * stitchW;
				const y = row * stitchH;
				// Offset every other row
				const offset = row % 2 === 0 ? 0 : stitchW / 2;

				// V-stitch: two short diagonal strokes forming a V
				const cx = x + offset;
				const cy = y;

				// Light ridge (top of stitch)
				ctx.strokeStyle = 'rgba(255,255,255,0.25)';
				ctx.beginPath();
				ctx.moveTo(cx - stitchW * 0.35, cy);
				ctx.lineTo(cx, cy + stitchH * 0.5);
				ctx.stroke();

				// Dark groove (bottom of stitch)
				ctx.strokeStyle = 'rgba(0,0,0,0.3)';
				ctx.beginPath();
				ctx.moveTo(cx, cy + stitchH * 0.5);
				ctx.lineTo(cx + stitchW * 0.35, cy);
				ctx.stroke();

				// Subtle horizontal separation between rows
				ctx.strokeStyle = 'rgba(0,0,0,0.12)';
				ctx.lineWidth = 0.5;
				ctx.beginPath();
				ctx.moveTo(cx - stitchW * 0.4, cy + stitchH * 0.5);
				ctx.lineTo(cx + stitchW * 0.4, cy + stitchH * 0.5);
				ctx.stroke();
				ctx.lineWidth = 1.5;
			}
		}

		// Add fiber noise on top
		const imageData = ctx.getImageData(0, 0, size, size);
		const { data } = imageData;
		for (let i = 0; i < data.length; i += 4) {
			const n = (Math.random() - 0.5) * 30;
			data[i] = Math.min(255, Math.max(0, data[i]! + n));
			data[i + 1] = Math.min(255, Math.max(0, data[i + 1]! + n));
			data[i + 2] = Math.min(255, Math.max(0, data[i + 2]! + n));
		}
		ctx.putImageData(imageData, 0, 0);

		const texture = new THREE.CanvasTexture(canvas);
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(24, 24);
		texture.anisotropy = 8;
		return texture;
	}, []);
}

function ShirtWithDecals({ images, isDark }: { images: Array<string>; isDark: boolean }) {
	const { nodes } = useGLTF('/shop/shirt.glb') as any;
	const groupRef = React.useRef<any>(null);
	const fabricMap = useFabricTexture(isDark);
	const bumpMap = useBumpTexture();

	// Clone the bump texture for the decal with its own repeat —
	// the decal has 0-1 UVs across a small area, so fewer tiles
	const decalNormalMap = React.useMemo(() => {
		const tex = bumpMap.clone();
		tex.repeat.set(4, 4);
		tex.needsUpdate = true;
		return tex;
	}, [bumpMap]);

	// Transition state machine: visible → fading-out → swap → fading-in → visible
	const [combo, setCombo] = React.useState({ imageIdx: 0, placementIdx: 0 });
	const [nextCombo, setNextCombo] = React.useState<{
		imageIdx: number;
		placementIdx: number;
	} | null>(null);
	const decalOpacity = React.useRef(1);
	const phase = React.useRef<'visible' | 'fading-out' | 'fading-in'>('visible');
	const decalMatRef = React.useRef<any>(null);

	// Queue a new combo every cycle
	React.useEffect(() => {
		const id = setInterval(() => {
			const next = (() => {
				let ni: number;
				let np: number;
				do {
					ni = Math.floor(Math.random() * images.length);
					np = Math.floor(Math.random() * PLACEMENTS.length);
				} while (np === combo.placementIdx || (ni === combo.imageIdx && np === combo.placementIdx));
				return { imageIdx: ni, placementIdx: np };
			})();
			setNextCombo(next);
			phase.current = 'fading-out';
		}, 6000);
		return () => clearInterval(id);
	}, [images.length, combo]);

	const decalTexture = useTexture(images[combo.imageIdx]!);
	const placement = PLACEMENTS[combo.placementIdx]!;

	const decalScale = React.useMemo(() => {
		const img = decalTexture.image as HTMLImageElement | undefined;
		if (!img || !img.width || !img.height)
			return [placement.scale, placement.scale, 1] as [number, number, number];
		const aspect = img.width / img.height;
		let sx = placement.scale;
		let sy = placement.scale;
		if (aspect > 1) {
			sx = placement.scale * aspect;
		} else {
			sy = placement.scale / aspect;
		}
		if (placement.maxWidth && sx > placement.maxWidth) {
			const ratio = placement.maxWidth / sx;
			sx *= ratio;
			sy *= ratio;
		}
		return [sx, sy, 1] as [number, number, number];
	}, [decalTexture, placement.scale, placement.maxWidth]);

	useFrame((state, delta) => {
		if (!groupRef.current) return;

		// Subtle idle camera drift — slow sine waves on position
		const t = state.clock.elapsedTime;
		state.camera.position.x = 0.06 + Math.sin(t * 0.3) * 0.005;
		state.camera.position.y = 0.095 + Math.cos(t * 0.25) * 0.003;
		state.camera.position.z = 0.45 + (Math.sin(t * 0.15) + Math.sin(t * 0.37)) * 0.035;

		const targetRot: [number, number, number] = [
			placement.shirtRot[0] + state.pointer.y * 0.02,
			placement.shirtRot[1] + state.pointer.x * -0.03,
			placement.shirtRot[2],
		];
		// Strip last frame's Y drift before damping (so it doesn't accumulate)
		const prevT = t - delta;
		groupRef.current.rotation.x -= Math.sin(prevT * 0.2) * 0.1;

		easing.damp3(groupRef.current.position, placement.shirtPos, 0.8, delta);
		easing.dampE(groupRef.current.rotation, targetRot, 0.8, delta);

		// Re-apply this frame's X drift (tilt up/down)
		groupRef.current.rotation.x += Math.sin(t * 0.2) * 0.1;

		// Animate decal opacity
		const speed = 2; // opacity units per second
		if (phase.current === 'fading-out') {
			decalOpacity.current = Math.max(0, decalOpacity.current - delta * speed);
			if (decalOpacity.current <= 0 && nextCombo) {
				setCombo(nextCombo);
				setNextCombo(null);
				phase.current = 'fading-in';
			}
		} else if (phase.current === 'fading-in') {
			decalOpacity.current = Math.min(1, decalOpacity.current + delta * speed);
			if (decalOpacity.current >= 1) {
				phase.current = 'visible';
			}
		}

		// Apply opacity to decal material
		if (decalMatRef.current) {
			decalMatRef.current.opacity = decalOpacity.current;
		}
	});

	return (
		<group ref={groupRef}>
			<mesh geometry={nodes.T_Shirt_male.geometry} dispose={null}>
				<meshPhysicalMaterial
					color={isDark ? '#020202' : '#ffffff'}
					map={fabricMap}
					normalMap={bumpMap}
					normalScale={new THREE.Vector2(isDark ? 0.03 : 0.4, isDark ? 0.03 : 0.4)}
					roughness={isDark ? 0.9 : 0.7}
					metalness={0}
					envMapIntensity={isDark ? 0.3 : 1.0}
					sheen={isDark ? 0.25 : 0.8}
					sheenRoughness={isDark ? 0.7 : 0.4}
					sheenColor={isDark ? '#2a2a2e' : '#eae5e0'}
					side={THREE.DoubleSide}
				/>
				<Decal
					position={[...placement.decal]}
					rotation={[...(placement.decalRotation ?? [0, 0, 0])]}
					scale={decalScale}
				>
					<meshPhysicalMaterial
						ref={decalMatRef}
						map={decalTexture}
						normalMap={decalNormalMap}
						normalScale={new THREE.Vector2(isDark ? 0.1 : 0.3, isDark ? 0.1 : 0.3)}
						transparent
						polygonOffset
						polygonOffsetFactor={-1}
						roughness={0.95}
						metalness={0}
						envMapIntensity={0.3}
						color={isDark ? '#dddddd' : '#f0f0f0'}
						side={THREE.FrontSide}
					/>
				</Decal>
			</mesh>
		</group>
	);
}

useGLTF.preload('/shop/shirt.glb');
