import createAsyncLoadingHighlighter from "./async-syntax-highlighter.js";
import supportedLanguages from "./languages/prism/supported-languages.js";

export default createAsyncLoadingHighlighter({
	loader: () =>
		import(
			/* webpackChunkName:"react-syntax-highlighter/refractor-import" */
			"refractor/all" // Import all languages from refractor
		).then((module) => {
			return module.refractor;
		}),
	noAsyncLoadingLanguages: true,
	supportedLanguages,
});
