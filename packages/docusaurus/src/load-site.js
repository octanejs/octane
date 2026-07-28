import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSupportedDocusaurusRuntime, resolveDocusaurusCore } from './version.js';

export async function loadDocusaurusSite(options = {}) {
	const siteDir = path.resolve(options.siteDir ?? process.cwd());
	const core = await resolveDocusaurusCore(siteDir);
	assertSupportedDocusaurusRuntime(core, options);

	const siteModuleUrl = pathToFileURL(path.join(core.packageRoot, 'lib/server/site.js')).href;
	const siteModule = await import(siteModuleUrl);
	if (typeof siteModule.loadSite !== 'function') {
		throw new Error(
			`[@octanejs/docusaurus] @docusaurus/core@${core.version} no longer exposes the ` +
				'internal server/site loadSite() seam.',
		);
	}

	const site = await siteModule.loadSite({
		siteDir,
		...(options.outDir === undefined ? {} : { outDir: options.outDir }),
		...(options.config === undefined ? {} : { config: options.config }),
		...(options.locale === undefined ? {} : { locale: options.locale }),
		...(options.automaticBaseUrlLocalizationDisabled === undefined
			? {}
			: {
					automaticBaseUrlLocalizationDisabled: options.automaticBaseUrlLocalizationDisabled,
				}),
	});

	return {
		corePath: core.packageRoot,
		docusaurusVersion: core.version,
		site,
	};
}
