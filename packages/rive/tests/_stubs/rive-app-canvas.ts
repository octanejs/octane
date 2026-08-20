export type Bounds = {
	minX?: number;
	minY?: number;
	maxX: number;
	maxY: number;
};

export type RiveParameters = {
	canvas?: HTMLCanvasElement;
	src?: string;
	buffer?: ArrayBuffer;
	artboard?: string;
	animations?: string | string[];
	stateMachines?: string | string[];
	layout?: Layout;
	autoplay?: boolean;
	shouldDisableRiveListeners?: boolean;
	automaticallyHandleEvents?: boolean;
	useOffscreenRenderer?: boolean;
	onLoad?: () => void;
	onLoadError?: () => void;
};

export type RiveFileParameters = {
	src?: string;
	buffer?: ArrayBuffer;
	onLoad?: () => void;
	onLoadError?: () => void;
};

export type StateMachineInput = {
	name: string;
	value?: number | boolean;
};

export type ViewModelInstanceValue = {
	on: (callback: () => void) => void;
	off: (callback: () => void) => void;
};

export type ViewModelInstanceNumber = ViewModelInstanceValue & {
	value: number;
};

export type ViewModelInstanceString = ViewModelInstanceValue & {
	value: string;
};

export type ViewModelInstanceBoolean = ViewModelInstanceValue & {
	value: boolean;
};

export type ViewModelInstanceColor = ViewModelInstanceValue & {
	value: number;
	rgb: (r: number, g: number, b: number) => void;
	rgba: (r: number, g: number, b: number, a: number) => void;
	alpha: (a: number) => void;
	opacity: (o: number) => void;
};

export type ViewModelInstanceEnum = ViewModelInstanceValue & {
	value: string;
	values: string[];
};

export type ViewModelInstanceTrigger = ViewModelInstanceValue & {
	trigger: () => void;
};

export type ViewModelInstanceAssetImage = ViewModelInstanceValue & {
	value: unknown;
};

export type ViewModelInstanceAssetFont = ViewModelInstanceValue & {
	value: unknown;
};

export type ViewModelInstanceList = ViewModelInstanceValue & {
	length: number;
	addInstance: (instance: ViewModelInstance) => void;
	addInstanceAt: (instance: ViewModelInstance, index: number) => boolean;
	removeInstance: (instance: ViewModelInstance) => void;
	removeInstanceAt: (index: number) => void;
	instanceAt: (index: number) => ViewModelInstance | null;
	swap: (a: number, b: number) => void;
};

export type ViewModelInstanceArtboard = ViewModelInstanceValue & {
	value: unknown;
};

export type ViewModelInstance = {
	number: (path: string) => ViewModelInstanceNumber | null;
	string: (path: string) => ViewModelInstanceString | null;
	boolean: (path: string) => ViewModelInstanceBoolean | null;
	color: (path: string) => ViewModelInstanceColor | null;
	enum: (path: string) => ViewModelInstanceEnum | null;
	trigger: (path: string) => ViewModelInstanceTrigger | null;
	image: (path: string) => ViewModelInstanceAssetImage | null;
	font: (path: string) => ViewModelInstanceAssetFont | null;
	list: (path: string) => ViewModelInstanceList | null;
	artboard: (path: string) => ViewModelInstanceArtboard | null;
};

export type ViewModel = {
	instanceByName: (name: string) => ViewModelInstance | null;
	instance?: () => ViewModelInstance | null;
	defaultInstance?: () => ViewModelInstance | null;
};

export const EventType = {
	Load: 'load',
	LoadError: 'loaderror',
};

export const Fit = {
	Cover: 'cover',
	Layout: 'layout',
};

export const Alignment = {
	Center: 'center',
};

export const StateMachineInputType = {
	Number: 1,
	Boolean: 2,
	Trigger: 3,
};

export class Layout {}

export class Rive {
	layout: { fit?: string; layoutScaleFactor?: number } | null = null;
	bounds: Bounds | undefined = undefined;
	devicePixelRatioUsed = 1;
	artboardWidth = 0;
	artboardHeight = 0;
	isPlaying = false;
	isPaused = false;
	animationNames: string[] = [];
	viewModelInstance: ViewModelInstance | null = null;

	constructor(_params?: RiveParameters) {}

	on(_type: string, _callback: () => void): void {}
	off(_type: string, _callback: () => void): void {}
	stop(_names?: string[]): void {}
	play(_names?: string | string[]): void {}
	pause(_names?: string | string[]): void {}
	stopRendering(): void {}
	startRendering(): void {}
	cleanup(): void {}
	resizeToCanvas(): void {}
	bind(): void {}
	stateMachineInputs(_name: string): StateMachineInput[] | undefined {
		return undefined;
	}
	viewModelByName(_name: string): ViewModel | null {
		return null;
	}
	defaultViewModel(): ViewModel | null {
		return null;
	}
	setViewModelInstance(instance: ViewModelInstance): void {
		this.viewModelInstance = instance;
	}
	setGlobalViewModelInstance(_name: string, _instance: ViewModelInstance): boolean {
		return false;
	}
	globalViewModelInstance(_name: string): ViewModelInstance | null {
		return null;
	}
}

export class RiveFile {
	constructor(_params?: RiveFileParameters) {}
	init(): void {}
	on(_type: string, _callback: () => void): void {}
	getInstance(): RiveFile {
		return this;
	}
	cleanup(): void {}
}

export function decodeImage(_bytes: Uint8Array): Promise<unknown> {
	return Promise.resolve(null);
}

export function decodeFont(_bytes: Uint8Array): Promise<unknown> {
	return Promise.resolve(null);
}
