import { useEffect, useState } from 'octane';
import type { FileStatus, RiveFileState, UseRiveFileParameters } from '../types.ts';
import { EventType, RiveFile } from '@rive-app/canvas';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Custom hook for initializing and managing a RiveFile instance within a component.
 * It sets up a RiveFile based on provided source parameters (URL or ArrayBuffer) and ensures
 * proper cleanup to avoid memory leaks when the component unmounts or inputs change.
 *
 * @param params - Object containing parameters accepted by the Rive file in the @rive-app/canvas runtime,
 *
 * @returns {RiveFileState} Contains the active RiveFile instance (`riveFile`) and the loading status.
 */
function useRiveFile(...rawArgs: unknown[]): RiveFileState {
	const [args, slot] = splitSlot(rawArgs);
	const params = args[0] as UseRiveFileParameters;

	const [riveFile, setRiveFile] = useState<RiveFile | null>(null, subSlot(slot, 'file'));
	const [status, setStatus] = useState<FileStatus>('idle', subSlot(slot, 'status'));

	useEffect(
		function loadFile() {
			let file: RiveFile | null = null;

			async function loadRiveFile() {
				try {
					setStatus('loading');
					file = new RiveFile(params);
					file.init();
					file.on(EventType.Load, function onLoad() {
						// We request an instance to add +1 to the referencesCount so it doesn't get destroyed
						// while this hook is active
						file?.getInstance();
						setRiveFile(file);
						setStatus('success');
					});
					file.on(EventType.LoadError, function onError() {
						setStatus('failed');
					});
					setRiveFile(file);
				} catch (error) {
					console.error(error);
					setStatus('failed');
				}
			}

			void loadRiveFile();

			return function cleanup() {
				file?.cleanup();
			};
		},
		[params.src, params.buffer],
		subSlot(slot, 'load'),
	);

	return { riveFile: riveFile, status: status };
}

export default useRiveFile;
