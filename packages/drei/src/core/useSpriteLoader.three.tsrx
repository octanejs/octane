import { useLoader, useThree } from '@octanejs/three';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { slotDefault } from './compiler-slot.js';

export type Size = { w: number; h: number };

export type FrameData = {
	frame: { x: number; y: number; w: number; h: number };
	scaleRatio?: number;
	rotated: boolean;
	trimmed: boolean;
	spriteSourceSize: { x: number; y: number; w: number; h: number };
	sourceSize: Size;
};

export type MetaData = {
	version: string;
	size: Size;
	rows: number;
	columns: number;
	frameWidth: number;
	frameHeight: number;
	scale: string;
};

type Frames = Record<string, FrameData[]> | FrameData[];

export type SpriteData = { frames: Frames; meta: MetaData };

type SpriteMetaDimension = { row: number; col: number };

type SourceFrame = FrameData & { filename?: string };

export const getFirstFrame = (frames: SpriteData['frames'], frameName?: string): FrameData => {
	if (Array.isArray(frames)) return frames[0];
	const key = frameName ?? Object.keys(frames)[0];
	return frames[key][0];
};

export const checkIfFrameIsEmpty = (frameData: Uint8ClampedArray): boolean => {
	for (let index = 3; index < frameData.length; index += 4) {
		if (frameData[index] !== 0) return false;
	}
	return true;
};

export function useSpriteLoader<Url extends string>(
	input: Url | null,
	json?: string | null,
	animationNames?: string[] | null,
	numberOfFrames?: number | null,
	onLoad?: (texture: THREE.Texture, textureData?: SpriteData | null) => void,
	canvasRenderingContext2DSettings?: CanvasRenderingContext2DSettings,
) {
	json = slotDefault(json, undefined);
	animationNames = slotDefault(animationNames, undefined);
	numberOfFrames = slotDefault(numberOfFrames, undefined);
	onLoad = slotDefault(onLoad, undefined);
	canvasRenderingContext2DSettings = slotDefault(canvasRenderingContext2DSettings, undefined);
	const viewportRef = useRef(useThree((state) => state.viewport));
	const spriteDataRef = useRef<SpriteData | null>(null);
	const totalFrames = useRef(0);
	const inputRef = useRef(input);
	const jsonRef = useRef(json);
	const animationFramesRef = useRef(animationNames);
	const [spriteData, setSpriteData] = useState<SpriteData | null>(null);
	const [spriteTexture, setSpriteTexture] = useState<THREE.Texture>(new THREE.Texture());
	const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
	const [spriteObj, setSpriteObj] = useState<{
		spriteTexture: THREE.Texture;
		spriteData: SpriteData | null;
		aspect: THREE.Vector3;
	} | null>(null);

	const calculateAspectRatio = useCallback((width: number, height: number, factor: number) => {
		const viewport = viewportRef.current;
		const adaptedHeight = height * (viewport.aspect > width / height ? viewport.width / width : viewport.height / height);
		const adaptedWidth = width * (viewport.aspect > width / height ? viewport.width / width : viewport.height / height);
		const scaleX = adaptedWidth * factor;
		const scaleY = adaptedHeight * factor;
		let finalMaxScaleW = Math.min(1, scaleX);
		let finalMaxScaleH = Math.min(1, scaleY);
		if (scaleX > 1) {
			finalMaxScaleW = 1;
			finalMaxScaleH = scaleY / scaleX;
		}
		return new THREE.Vector3(finalMaxScaleW, finalMaxScaleH, 1);
	}, []);

	const getRowsAndColumns = useCallback((texture: THREE.Texture, frames: number) => {
		if (!texture.image) return { rows: 0, columns: 0, frameWidth: 0, frameHeight: 0, emptyFrames: [] as SpriteMetaDimension[] };
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d', canvasRenderingContext2DSettings);
		if (!context) throw new Error('Failed to get 2d context');
		canvas.width = texture.image.width;
		canvas.height = texture.image.height;
		context.drawImage(texture.image, 0, 0);
		const width = texture.image.width;
		const height = texture.image.height;
		const columns = Math.round(Math.sqrt(frames * (width / height)));
		const rows = Math.round(frames / columns);
		const frameWidth = width / columns;
		const frameHeight = height / rows;
		const emptyFrames: SpriteMetaDimension[] = [];
		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const frameIndex = row * columns + column;
				if (frameIndex >= frames) {
					emptyFrames.push({ row, col: column });
					continue;
				}
				const data = context.getImageData(column * frameWidth, row * frameHeight, frameWidth, frameHeight).data;
				if (checkIfFrameIsEmpty(data)) emptyFrames.push({ row, col: column });
			}
		}
		return { rows, columns, frameWidth, frameHeight, emptyFrames };
	}, [canvasRenderingContext2DSettings]);

	const calculateScaleRatio = useCallback((frames: FrameData[] | Record<string, FrameData[]>) => {
		const process = (values: FrameData[]) => {
			let largest: { area: number } | null = null;
			for (const value of values) {
				const area = value.frame.w * value.frame.h;
				if (!largest || area > largest.area) largest = { area };
			}
			return values.map((value) => {
				const area = value.frame.w * value.frame.h;
				return { ...value, scaleRatio: largest ? (area === largest.area ? 1 : Math.sqrt(area / largest.area)) : 1 };
			});
		};
		if (Array.isArray(frames)) return process(frames);
		const result: Record<string, FrameData[]> = {};
		for (const key in frames) result[key] = process(frames[key]);
		return result;
	}, []);

	const parseFrames = useCallback((): Frames => {
		const sprites: Record<string, FrameData[]> = {};
		const data = spriteDataRef.current;
		const delimiters = animationFramesRef.current;
		if (!data) return [];
		if (delimiters && Array.isArray(data.frames)) {
			for (const delimiter of delimiters) {
				sprites[delimiter] = [];
				for (const rawValue of data.frames) {
					const value = rawValue as SourceFrame;
					if (typeof value.filename === 'string' && value.filename.toLowerCase().includes(delimiter.toLowerCase())) {
						sprites[delimiter].push({ ...value, frame: value.frame, sourceSize: { w: value.sourceSize.w, h: value.sourceSize.h } });
					}
				}
			}
			for (const key in sprites) sprites[key] = calculateScaleRatio(sprites[key]) as FrameData[];
			return sprites;
		}
		if (delimiters && typeof data.frames === 'object') {
			for (const delimiter of delimiters) {
				sprites[delimiter] = [];
				for (const innerKey in data.frames) {
					const value = (data.frames as Record<string, FrameData[]>)[innerKey] as unknown as SourceFrame;
					if (innerKey.toLowerCase().includes(delimiter.toLowerCase())) {
						sprites[delimiter].push({ ...value, frame: value.frame, sourceSize: { w: value.sourceSize.w, h: value.sourceSize.h } });
					}
				}
			}
			for (const key in sprites) sprites[key] = calculateScaleRatio(sprites[key]) as FrameData[];
			return sprites;
		}
		const values = (Array.isArray(data.frames) ? data.frames : Object.values(data.frames).flat()).map((value) => ({
			...value,
			x: value.frame.x,
			y: value.frame.y,
			w: value.frame.w,
			h: value.frame.h,
		}));
		return calculateScaleRatio(values) as FrameData[];
	}, [calculateScaleRatio, spriteDataRef]);

	const parseSpriteData = useCallback((jsonData: SpriteData | null, texture: THREE.Texture) => {
		let aspect = new THREE.Vector3(1, 1, 1);
		if (jsonData === null) {
			if (texture && numberOfFrames) {
				const width = texture.image.width;
				const height = texture.image.height;
				totalFrames.current = numberOfFrames;
				const { rows, columns, frameWidth, frameHeight, emptyFrames } = getRowsAndColumns(texture, numberOfFrames);
				const generated: SpriteData = { frames: [], meta: { version: '1.0', size: { w: width, h: height }, rows, columns, frameWidth, frameHeight, scale: '1' } };
				for (let row = 0; row < rows; row++) {
					for (let column = 0; column < columns; column++) {
						if (emptyFrames.some((coord) => coord.row === row && coord.col === column)) continue;
						(generated.frames as FrameData[]).push({
							frame: { x: column * frameWidth, y: row * frameHeight, w: frameWidth, h: frameHeight },
							scaleRatio: 1,
							rotated: false,
							trimmed: false,
							spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
							sourceSize: { w: frameWidth, h: frameHeight },
						});
					}
				}
				aspect = calculateAspectRatio(frameWidth, frameHeight, 0.1);
				spriteDataRef.current = generated;
			}
			if (spriteDataRef.current?.frames) spriteDataRef.current.frames = calculateScaleRatio(spriteDataRef.current.frames);
		} else if (texture) {
			spriteDataRef.current = jsonData;
			spriteDataRef.current.frames = parseFrames();
			totalFrames.current = Array.isArray(jsonData.frames) ? jsonData.frames.length : Object.keys(jsonData.frames).length;
			const { w, h } = getFirstFrame(jsonData.frames).sourceSize;
			aspect = calculateAspectRatio(w, h, 0.1);
		}
		setSpriteData(spriteDataRef.current);
		if ('encoding' in texture) (texture as THREE.Texture & { encoding: number }).encoding = 3001;
		else texture.colorSpace = THREE.SRGBColorSpace;
		setSpriteTexture(texture);
		setSpriteObj({ spriteTexture: texture, spriteData: spriteDataRef.current, aspect });
	}, [getRowsAndColumns, numberOfFrames, parseFrames, calculateAspectRatio, calculateScaleRatio]);

	const loadJsonAndTextureAndExecuteCallback = useCallback((jsonUrl: string, textureUrl: string, callback: (data: SpriteData, texture: THREE.Texture) => void): void => {
		const jsonPromise = fetch(jsonUrl).then((response) => response.json() as Promise<SpriteData>);
		const texturePromise = new Promise<THREE.Texture>((resolve) => textureLoader.load(textureUrl, resolve));
		Promise.all([jsonPromise, texturePromise]).then(([data, texture]) => callback(data, texture));
	}, [textureLoader]);

	const loadStandaloneSprite = useCallback((textureUrl?: string) => {
		if (!textureUrl && !inputRef.current) throw new Error('Either textureUrl or input must be provided');
		const validUrl = textureUrl ?? inputRef.current;
		if (!validUrl) throw new Error('A valid texture URL must be provided');
		textureLoader.load(validUrl, (texture) => parseSpriteData(null, texture));
	}, [textureLoader, parseSpriteData]);

	const loadJsonAndTexture = useCallback((textureUrl: string, jsonUrl?: string) => {
		if (jsonUrl && textureUrl) loadJsonAndTextureAndExecuteCallback(jsonUrl, textureUrl, parseSpriteData);
		else loadStandaloneSprite(textureUrl);
	}, [loadJsonAndTextureAndExecuteCallback, loadStandaloneSprite, parseSpriteData]);

	useLayoutEffect(() => {
		if (jsonRef.current && inputRef.current) loadJsonAndTextureAndExecuteCallback(jsonRef.current, inputRef.current, parseSpriteData);
		else if (inputRef.current) loadStandaloneSprite();
		const currentInput = inputRef.current;
		return () => { if (currentInput) useLoader.clear(THREE.TextureLoader, currentInput); };
	}, [loadJsonAndTextureAndExecuteCallback, loadStandaloneSprite, parseSpriteData]);

	useLayoutEffect(() => onLoad?.(spriteTexture, spriteData ?? null), [spriteTexture, spriteData, onLoad]);
	return { spriteObj, loadJsonAndTexture };
}

useSpriteLoader.preload = (url: string) => useLoader.preload(THREE.TextureLoader, url);
useSpriteLoader.clear = (input: string) => useLoader.clear(THREE.TextureLoader, input);
