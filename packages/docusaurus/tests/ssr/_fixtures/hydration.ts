import { prerenderDocusaurusRoute } from '@octanejs/docusaurus/server';
import {
	createDocusaurusTestManifest,
	createDocusaurusTestRegistry,
} from '../../_fixtures/docusaurus-app.js';

export async function renderDocusaurusHydrationRoute(url: string) {
	const result = await prerenderDocusaurusRoute(
		url,
		createDocusaurusTestManifest(),
		createDocusaurusTestRegistry(),
	);
	if (result instanceof Response) {
		throw new Error(`Unexpected Docusaurus redirect response: ${result.status}`);
	}
	return result;
}
