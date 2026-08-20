import { useState, useEffect } from 'react';
import type {
  UseRiveFileParameters,
  RiveFileState,
  FileStatus,
} from '../types';
import { EventType, RiveFile } from '@rive-app/canvas';

/**
 * Custom hook for initializing and managing a RiveFile instance within a component.
 * It sets up a RiveFile based on provided source parameters (URL or ArrayBuffer) and ensures
 * proper cleanup to avoid memory leaks when the component unmounts or inputs change.
 *
 * @param params - Object containing parameters accepted by the Rive file in the @rive-app/canvas runtime,
 *
 * @returns {RiveFileState} Contains the active RiveFile instance (`riveFile`) and the loading status.
 */
function useRiveFile(params: UseRiveFileParameters): RiveFileState {
  const [riveFile, setRiveFile] = useState<RiveFile | null>(null);
  const [status, setStatus] = useState<FileStatus>('idle');

  useEffect(() => {
    let file: RiveFile | null = null;

    const loadRiveFile = async () => {
      try {
        setStatus('loading');
        file = new RiveFile(params);
        file.init();
        file.on(EventType.Load, () => {
          // We request an instance to add +1 to the referencesCount so it doesn't get destroyed
          // while this hook is active
          file?.getInstance();
          setRiveFile(file);
          setStatus('success');
        });
        file.on(EventType.LoadError, () => {
          setStatus('failed');
        });
        setRiveFile(file);
      } catch (error) {
        console.error(error);
        setStatus('failed');
      }
    };

    loadRiveFile();

    return () => {
      file?.cleanup();
    };
  }, [params.src, params.buffer]);

  return { riveFile, status };
}

export default useRiveFile;
