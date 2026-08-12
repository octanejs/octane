import { Document, Page } from '@octanejs/pdf';
import { useMemo } from 'octane';

import { createProbePdf } from '../../feasibility/fixture';

export interface PdfHydrationFixtureProps {
	onDocumentReady?: () => void;
	onPageReady?: () => void;
}

export function PdfHydrationFixture(
	{ onDocumentReady, onPageReady }: PdfHydrationFixtureProps = {},
) @{
	const file = useMemo(() => ({ data: createProbePdf() }), []);
	<Document file={file} loading="Hydrating PDF…" onLoadSuccess={onDocumentReady}>
		<Page
			pageNumber={1}
			width={120}
			renderAnnotationLayer={false}
			renderTextLayer={false}
			onRenderSuccess={onPageReady}
		/>
	</Document>
}
