interface SharedBridge {
	rename(label: string): void;
	unmount(): void;
	rememberInput(): void;
	inputIsSame(): boolean;
}

interface NativeBridge extends SharedBridge {
	mode: 'native';
	setSignal(value: number): void;
	read$(): number;
	showReaders(visible: boolean): void;
	disposeData(): void;
}

interface OrdinaryBridge extends SharedBridge {
	mode: 'ordinary';
}

declare global {
	interface Window {
		__nativeCollectionBrowser: NativeBridge | OrdinaryBridge;
	}
}

export {};
