/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, type Vector3, useFrame } from '@octanejs/three';
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import * as THREE from 'three';
import { Instance, Instances, type InstanceProps, type InstancesProps } from './Instances.three.tsrx';
import { Billboard } from './scene-motion.three.tsrx';
import {
	getFirstFrame,
	type FrameData,
	type Size,
	type SpriteData,
	useSpriteLoader,
} from './useSpriteLoader.three.tsrx';

type AnimationEventData = { currentFrameName: string; currentFrame: number };
type CommonProps<T, U, V> = Pick<T & U & V, keyof T & keyof U & keyof V>;
type CommonMeshProps = CommonProps<ThreeElements['mesh'], InstanceProps, InstancesProps>;

export type SpriteAnimatorProps = {
	startFrame?: number;
	endFrame?: number;
	fps?: number;
	frameName?: string;
	textureDataURL?: string;
	textureImageURL?: string;
	loop?: boolean;
	numberOfFrames?: number;
	autoPlay?: boolean;
	animationNames?: string[];
	onStart?: (data: AnimationEventData) => void;
	onEnd?: (data: AnimationEventData) => void;
	onLoopEnd?: (data: AnimationEventData) => void;
	onFrame?: (data: AnimationEventData) => void;
	/** @deprecated Use pause={false} instead. */
	play?: boolean;
	pause?: boolean;
	flipX?: boolean;
	alphaTest?: number;
	asSprite?: boolean;
	offset?: number;
	playBackwards?: boolean;
	resetOnEnd?: boolean;
	instanceItems?: Vector3[];
	maxItems?: number;
	spriteDataset?: {
		spriteTexture: THREE.Texture;
		spriteData: SpriteData | null;
		aspect: Vector3;
	} | null;
	canvasRenderingContext2DSettings?: CanvasRenderingContext2DSettings;
	roundFramePosition?: boolean;
	meshProps?: CommonMeshProps;
	children?: OctaneNode;
} & Omit<ThreeElements['group'], 'ref' | 'children'>;

type SpriteAnimatorState = {
	current?: number;
	offset?: number;
	imageUrl?: string;
	hasEnded: boolean;
	ref: ThreeRef<THREE.Group> | undefined;
};

type Scale = Vector3;

const context = createContext<SpriteAnimatorState | null>(null);

export function useSpriteAnimator(): SpriteAnimatorState | null {
	return useContext(context);
}

function isSpriteData(data: SpriteData | null): data is SpriteData {
	return data !== null && 'meta' in data && 'frames' in data;
}

const geometry = /* @__PURE__ */ new THREE.PlaneGeometry(1, 1);

export function SpriteAnimator({
	startFrame = 0,
	endFrame,
	fps = 30,
	frameName = '',
	textureDataURL,
	textureImageURL,
	loop = false,
	numberOfFrames = 1,
	autoPlay = true,
	animationNames,
	onStart,
	onEnd,
	onLoopEnd,
	onFrame,
	play,
	pause = false,
	flipX = false,
	alphaTest = 0,
	children,
	asSprite = false,
	offset,
	playBackwards = false,
	resetOnEnd = false,
	maxItems = 1,
	instanceItems = [[0, 0, 0]],
	spriteDataset,
	canvasRenderingContext2DSettings,
	roundFramePosition = false,
	meshProps = {},
	ref: forwardedRef,
	...props
}: SpriteAnimatorProps & { ref?: ThreeRef<THREE.Group> }) @{
	const ref = useRef<THREE.Group | null>(new THREE.Group());
	const spriteData = useRef<SpriteData | null>(null);
	const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
	const spriteRef = useRef<THREE.Mesh | THREE.InstancedMesh | null>(null);
	const timerOffset = useRef(window.performance.now());
	const currentFrame = useRef(startFrame);
	const currentFrameName = useRef(frameName);
	const fpsInterval = fps > 0 ? 1000 / fps : 0;
	const [spriteTexture, setSpriteTexture] = useState(new THREE.Texture());
	const totalFrames = useRef(0);
	const [aspect, setAspect] = useState(new THREE.Vector3(1, 1, 1));
	const flipOffset = flipX ? -1 : 1;
	const pauseRef = useRef(pause);
	const pos = useRef(offset);
	const softEnd = useRef(false);
	const { spriteObj, loadJsonAndTexture } = useSpriteLoader(
		null,
		null,
		animationNames,
		numberOfFrames,
		undefined,
		canvasRenderingContext2DSettings,
	);
	const frameNameRef = useRef(frameName);

	const calculateAspectRatio = (width: number, height: number) => {
		const result = new THREE.Vector3();
		result.set(1, height / width, 1);
		spriteRef.current?.scale.copy(result);
		return result;
	};

	const parseSpriteDataLite = useCallback((textureData: THREE.Texture, data: SpriteData | null) => {
		if (data === null) {
			if (numberOfFrames) {
				totalFrames.current = numberOfFrames;
				if (playBackwards) currentFrame.current = numberOfFrames - 1;
				spriteData.current = data;
			}
		} else {
			spriteData.current = data;
			if (Array.isArray(spriteData.current.frames)) totalFrames.current = spriteData.current.frames.length;
			else if (typeof spriteData.current === 'object' && frameNameRef.current) {
				totalFrames.current = spriteData.current.frames[frameNameRef.current].length;
			} else totalFrames.current = 0;
			if (playBackwards) currentFrame.current = totalFrames.current - 1;
			const { w, h } = getFirstFrame(spriteData.current?.frames ?? [], frameNameRef.current).sourceSize;
			setAspect(calculateAspectRatio(w, h));
			if (matRef.current) matRef.current.map = textureData;
		}
		setSpriteTexture(textureData);
	}, [numberOfFrames, playBackwards]);

	const modifySpritePosition = useCallback((): void => {
		if (!spriteData.current) return;
		const { meta: { size: metaInfo }, frames } = spriteData.current;
		const { w: frameW, h: frameH } = Array.isArray(frames)
			? frames[0].sourceSize
			: frameName
				? frames[frameName]
					? frames[frameName][0].sourceSize
					: { w: 0, h: 0 }
				: { w: 0, h: 0 };
		if (matRef.current?.map) {
			matRef.current.map.wrapS = matRef.current.map.wrapT = THREE.RepeatWrapping;
			matRef.current.map.center.set(0, 0);
			matRef.current.map.repeat.set(flipOffset / (metaInfo.w / frameW), 1 / (metaInfo.h / frameH));
		}
		const framesV = (metaInfo.h - 1) / frameH;
		const frameOffsetY = 1 / framesV;
		if (matRef.current?.map) {
			matRef.current.map.offset.x = 0;
			matRef.current.map.offset.y = 1 - frameOffsetY;
		}
		onStart?.({ currentFrameName: frameName ?? '', currentFrame: currentFrame.current });
	}, [flipOffset, frameName, onStart]);

	const state = useMemo<SpriteAnimatorState>(() => ({
		current: pos.current,
		offset: pos.current,
		imageUrl: textureImageURL,
		hasEnded: false,
		ref: forwardedRef,
	}), [textureImageURL, forwardedRef]);

	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!, []);
	useLayoutEffect(() => { pos.current = offset; }, [offset]);

	useEffect(() => {
		if (spriteDataset) parseSpriteDataLite(spriteDataset.spriteTexture.clone(), spriteDataset.spriteData);
		else if (textureImageURL && textureDataURL) loadJsonAndTexture(textureImageURL, textureDataURL);
	}, [loadJsonAndTexture, spriteDataset, textureDataURL, textureImageURL, parseSpriteDataLite]);

	useEffect(() => {
		if (spriteObj) parseSpriteDataLite(spriteObj.spriteTexture.clone(), spriteObj.spriteData);
	}, [spriteObj, parseSpriteDataLite]);

	useEffect(() => {
		state.hasEnded = false;
		if (spriteData.current && playBackwards === true) {
			currentFrame.current = ((spriteData.current.frames.length as number) ?? 0) - 1;
		} else currentFrame.current = 0;
	}, [playBackwards, state]);

	useLayoutEffect(() => { modifySpritePosition(); }, [spriteTexture, flipX, modifySpritePosition]);
	useEffect(() => { if (autoPlay) pauseRef.current = false; }, [autoPlay]);

	useLayoutEffect(() => {
		if (currentFrameName.current !== frameName && frameName) {
			currentFrame.current = 0;
			currentFrameName.current = frameName;
			state.hasEnded = false;
			if (fpsInterval <= 0) currentFrame.current = endFrame || startFrame || 0;
			if (spriteData.current) {
				const { w, h } = getFirstFrame(spriteData.current.frames, frameName).sourceSize;
				setAspect(calculateAspectRatio(w, h));
			}
		}
	}, [frameName, fpsInterval, state, endFrame, startFrame]);

	const calculateFinalPosition = (frameW: number, frameH: number, metaInfo: Size, spriteFrames: FrameData[]) => {
		const activeOffset = offset === undefined ? state.current : offset;
		const targetFrame = currentFrame.current;
		calculateAspectRatio(frameW, frameH);
		const framesH = roundFramePosition ? Math.round((metaInfo.w - 1) / frameW) : (metaInfo.w - 1) / frameW;
		const framesV = roundFramePosition ? Math.round((metaInfo.h - 1) / frameH) : (metaInfo.h - 1) / frameH;
		if (!spriteFrames[targetFrame]) return;
		const { frame: { x: frameX, y: frameY }, sourceSize: { w: originalSizeX, h: originalSizeY } } = spriteFrames[targetFrame];
		const frameOffsetX = 1 / framesH;
		const frameOffsetY = 1 / framesV;
		if (matRef.current?.map) {
			matRef.current.map.offset.x = flipOffset > 0
				? frameOffsetX * (frameX / originalSizeX)
				: frameOffsetX * (frameX / originalSizeX) - matRef.current.map.repeat.x;
			matRef.current.map.offset.y = Math.abs(1 - frameOffsetY) - frameOffsetY * (frameY / originalSizeY);
		}
		if (activeOffset !== undefined && activeOffset !== null) {
			let frameIndex = Math.floor(activeOffset * spriteFrames.length);
			frameIndex = Math.max(0, Math.min(frameIndex, spriteFrames.length - 1));
			if (isNaN(frameIndex)) frameIndex = 0;
			currentFrame.current = frameIndex;
		} else if (playBackwards) currentFrame.current -= 1;
		else currentFrame.current += 1;
	};

	const runAnimation = (): void => {
		if (!isSpriteData(spriteData.current)) return;
		const { meta: { size: metaInfo }, frames } = spriteData.current;
		const { w: frameW, h: frameH } = getFirstFrame(frames, frameName).sourceSize;
		const spriteFrames = Array.isArray(frames) ? frames : frameName ? frames[frameName] : [];
		const activeEndFrame = endFrame || spriteFrames.length - 1;
		const activeOffset = offset === undefined ? state.current : offset;
		if (fpsInterval <= 0) {
			currentFrame.current = endFrame || startFrame || 0;
			calculateFinalPosition(frameW, frameH, metaInfo, spriteFrames);
			return;
		}
		const now = window.performance.now();
		const difference = now - timerOffset.current;
		if (difference <= fpsInterval) return;
		const endCondition = playBackwards ? currentFrame.current < 0 : currentFrame.current > activeEndFrame;
		const onStartCondition = playBackwards ? currentFrame.current === activeEndFrame : currentFrame.current === 0;
		const manualProgressEndCondition = playBackwards ? currentFrame.current < 0 : currentFrame.current >= activeEndFrame;
		if (endCondition) {
			currentFrame.current = loop ? (startFrame ?? 0) : 0;
			if (playBackwards) currentFrame.current = activeEndFrame;
			if (loop) onLoopEnd?.({ currentFrameName: frameName ?? '', currentFrame: currentFrame.current });
			else {
				onEnd?.({ currentFrameName: frameName ?? '', currentFrame: currentFrame.current });
				state.hasEnded = !resetOnEnd;
				if (resetOnEnd) pauseRef.current = true;
			}
			if (!loop) return;
		} else if (onStartCondition) onStart?.({ currentFrameName: frameName ?? '', currentFrame: currentFrame.current });
		if (activeOffset !== undefined && manualProgressEndCondition) {
			if (softEnd.current === false) {
				onEnd?.({ currentFrameName: frameName ?? '', currentFrame: currentFrame.current });
				softEnd.current = true;
			}
		} else softEnd.current = false;
		if (difference <= fpsInterval) return;
		timerOffset.current = now - (difference % fpsInterval);
		calculateFinalPosition(frameW, frameH, metaInfo, spriteFrames);
	};

	useFrame(() => {
		if (!spriteData.current?.frames || !matRef.current?.map || pauseRef.current) return;
		if (!state.hasEnded && (autoPlay || play)) {
			runAnimation();
			onFrame?.({ currentFrameName: currentFrameName.current, currentFrame: currentFrame.current });
		}
	});

	function multiplyScale(initialScale = new THREE.Vector3(1, 1, 1), newScale: Scale = 1) {
		if (typeof newScale === 'number') return initialScale.multiplyScalar(newScale);
		if (Array.isArray(newScale)) return initialScale.multiply(new THREE.Vector3(...newScale));
		if (newScale instanceof THREE.Vector3) return initialScale.multiply(newScale);
	}

	<group {...props as any} ref={ref} scale={multiplyScale(aspect, props.scale as Scale | undefined)}>
		<context.Provider value={state}>
			@if (asSprite) {
				<Billboard>
					<mesh ref={spriteRef as any} scale={1} geometry={geometry} {...meshProps as any}>
						<meshBasicMaterial premultipliedAlpha={false} toneMapped={false} side={THREE.DoubleSide} ref={matRef} map={spriteTexture} transparent={true} alphaTest={alphaTest ?? 0} />
					</mesh>
				</Billboard>
			} @else {
				<Instances geometry={geometry} limit={maxItems ?? 1} {...meshProps as any}>
					<meshBasicMaterial premultipliedAlpha={false} toneMapped={false} side={THREE.DoubleSide} ref={matRef} map={spriteTexture} transparent={true} alphaTest={alphaTest ?? 0} />
					{(instanceItems ?? [0]).map((item, index) => (
						<Instance key={index} ref={(instanceItems?.length === 1 ? spriteRef : null) as any} position={item as Vector3} scale={1} {...meshProps as any} />
					))}
				</Instances>
			}
			{children}
		</context.Provider>
	</group>
}
