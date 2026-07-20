type MediaRecorderState = 'inactive' | 'paused' | 'recording';

type MediaRecorderOptions = {
	mimeType?: string;
};

type MediaRecorderDataAvailableEvent = Event & {
	data: Blob;
};

type MediaRecorderConstructor = {
	new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
	isTypeSupported: (mimeType: string) => boolean;
};

interface MediaRecorder extends EventTarget {
	ondataavailable: ((event: MediaRecorderDataAvailableEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	onstop: ((event: Event) => void) | null;
	readonly state: MediaRecorderState;
	start: () => void;
	stop: () => void;
}

interface Window {
	MediaRecorder?: MediaRecorderConstructor;
}
