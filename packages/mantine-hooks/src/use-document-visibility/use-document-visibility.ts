import { useEffect, useState } from 'octane';

export function useDocumentVisibility(): DocumentVisibilityState {
	const [documentVisibility, setDocumentVisibility] = useState<DocumentVisibilityState>('visible');

	useEffect(() => {
		setDocumentVisibility(document.visibilityState);
		const listener = () => setDocumentVisibility(document.visibilityState);
		document.addEventListener('visibilitychange', listener);
		return () => document.removeEventListener('visibilitychange', listener);
	}, []);

	return documentVisibility;
}
