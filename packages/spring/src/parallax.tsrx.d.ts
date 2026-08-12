import type { Controller, SpringConfig } from './engine';

type ConfigProp = SpringConfig | ((key: string) => SpringConfig);
type ElementRef<T> = { current: T | null };

export interface StickyConfig {
	start?: number;
	end?: number;
}

export interface IParallaxLayer {
	horizontal: boolean;
	sticky?: StickyConfig;
	isSticky: boolean;
	setHeight(height: number, immediate?: boolean): void;
	setPosition(height: number, scroll: number, immediate?: boolean): void;
}

export interface IParallax {
	config: ConfigProp;
	horizontal: boolean;
	busy: boolean;
	space: number;
	offset: number;
	current: number;
	controller: Controller<{ scroll: number }>;
	layers: Set<IParallaxLayer>;
	container: ElementRef<HTMLDivElement>;
	content: ElementRef<HTMLDivElement>;
	scrollTo(offset: number): void;
	update(): void;
	stop(): void;
}

export interface ParallaxProps {
	pages: number;
	config?: ConfigProp;
	horizontal?: boolean;
	enabled?: boolean;
	innerStyle?: Record<string, unknown>;
	ref?: ElementRef<IParallax> | ((value: IParallax | null) => void);
	style?: Record<string, unknown>;
	children?: unknown;
	[key: string]: unknown;
}

export interface ParallaxLayerProps {
	horizontal?: boolean;
	offset?: number;
	speed?: number;
	factor?: number;
	sticky?: StickyConfig;
	ref?: ElementRef<IParallaxLayer> | ((value: IParallaxLayer | null) => void);
	style?: Record<string, unknown>;
	children?: unknown;
	[key: string]: unknown;
}

export declare function Parallax(props: ParallaxProps): unknown;
export declare function ParallaxLayer(props: ParallaxLayerProps): unknown;
