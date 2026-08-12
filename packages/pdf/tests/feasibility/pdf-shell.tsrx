import { useEffect, useState } from 'octane';

export type PdfShellState = 'error' | 'loading' | 'page';

export interface PdfShellProps {
	error?: string;
	pageNumber?: number;
	state?: PdfShellState;
}

/**
 * Reduced U1 architecture probe for the markup that Document and Page must
 * render before PDF.js is allowed to touch browser-only APIs.
 */
export function PdfShell(
	{ error = 'Failed to load PDF file.', pageNumber = 1, state = 'loading' }: PdfShellProps = {},
) {
	const [phase, setPhase] = useState<'client' | 'server'>('server');

	useEffect(() => {
		setPhase('client');
	}, []);

	return <section class="react-pdf__Document" data-phase={phase} data-status={state}>
		{state === 'loading'
			? <div class="react-pdf__message react-pdf__message--loading">Loading PDF…</div>
			: state === 'error'
				? <div class="react-pdf__message react-pdf__message--error">{error}</div>
				: <div class="react-pdf__Page" data-page-number={pageNumber}>
						<div class="react-pdf__message react-pdf__message--loading">Loading page…</div>
					</div>}
	</section>;
}
