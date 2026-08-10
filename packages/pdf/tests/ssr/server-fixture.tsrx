import { Document, Page } from '@octanejs/pdf';

export function ServerDocumentFixture() {
	return <Document file={{ data: new Uint8Array([37, 80, 68, 70]) }}>
		<Page pageNumber={1} />
	</Document>;
}

export function ServerNoDataFixture() {
	return <Document noData="Choose a PDF" className={['custom-document']} />;
}
