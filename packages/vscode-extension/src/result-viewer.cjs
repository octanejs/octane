'use strict';

const OCTANE_OUTPUT_SCHEME = 'octane-output';
const COMPILED_OUTPUT_PATH = '/Octane Compiled Output.js';

/**
 * Expose compiler output as one reusable, read-only virtual document. Updating
 * the provider keeps subsequent compilations in the same editor tab and avoids
 * writing generated files into the user's workspace or operating-system temp
 * directory.
 *
 * @param {typeof import('vscode')} vscode
 * @param {import('vscode').ExtensionContext} context
 */
function registerOctaneResultViewer(vscode, context) {
	const outputUri = vscode.Uri.from({ scheme: OCTANE_OUTPUT_SCHEME, path: COMPILED_OUTPUT_PATH });
	/** @type {import('vscode').EventEmitter<import('vscode').Uri>} */
	const didChange = new vscode.EventEmitter();
	let compiledCode = '';

	/** @type {import('vscode').TextDocumentContentProvider} */
	const provider = {
		onDidChange: didChange.event,
		provideTextDocumentContent(uri) {
			return uri.toString() === outputUri.toString() ? compiledCode : '';
		},
	};

	const providerSubscription = vscode.workspace.registerTextDocumentContentProvider(
		OCTANE_OUTPUT_SCHEME,
		provider,
	);
	context.subscriptions.push(didChange, providerSubscription);

	return {
		outputUri,
		/** @param {string} code */
		async showCompiledCode(code) {
			compiledCode = code;
			didChange.fire(outputUri);
			let document = await vscode.workspace.openTextDocument(outputUri);
			if (document.languageId !== 'javascript') {
				document = await vscode.languages.setTextDocumentLanguage(document, 'javascript');
			}
			await vscode.window.showTextDocument(document, { preview: false });
		},
	};
}

module.exports = {
	COMPILED_OUTPUT_PATH,
	OCTANE_OUTPUT_SCHEME,
	registerOctaneResultViewer,
};
