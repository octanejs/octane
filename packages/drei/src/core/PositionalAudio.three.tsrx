/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElement, type ThreeRef, useLoader, useThree } from '@octanejs/three';
import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import {
	AudioListener,
	AudioLoader,
	PositionalAudio as PositionalAudioImpl,
} from 'three';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type PositionalAudioProps = Omit<
	ThreeElement<typeof PositionalAudioImpl>,
	'ref' | 'args'
> & {
	url: string;
	distance?: number;
	loop?: boolean;
	ref?: ThreeRef<PositionalAudioImpl>;
};

export function PositionalAudio({
	url,
	distance = 1,
	loop = true,
	autoplay,
	ref,
	...props
}: PositionalAudioProps) @{
	const sound = useRef<PositionalAudioImpl | null>(null);
	const mergedRef = useMemo(
		() => (value: PositionalAudioImpl | null) => {
			sound.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	const camera = useThree((state) => state.camera);
	const [listener] = useState(() => new AudioListener());
	const buffer = useLoader(AudioLoader, url);

	useEffect(() => {
		const current = sound.current;
		if (current) {
			current.setBuffer(buffer);
			current.setRefDistance(distance);
			current.setLoop(loop);
			if (autoplay && !current.isPlaying) current.play();
		}
	}, [buffer, camera, distance, loop]);

	useEffect(() => {
		const current = sound.current;
		camera.add(listener);
		return () => {
			camera.remove(listener);
			if (current) {
				if (current.isPlaying) current.stop();
				if (current.source && (current.source as { _connected?: boolean })._connected) {
					current.disconnect();
				}
			}
		};
	}, []);

	<positionalAudio ref={mergedRef} args={[listener]} autoplay={autoplay} {...props as any} />
}
