// Ported from react-syntax-highlighter/src/async-syntax-highlighter.js.
// React.PureComponent is expressed as an Octane function component with a
// post-commit effect. The public static methods and shared loader caches remain
// properties of the returned component function.
import { createElement, useEffect, useState } from "octane";
import highlight from "./highlight.js";

const EFFECT_SLOT = Symbol.for("@octanejs/syntax-highlighter:async:effect");
const STATE_SLOT = Symbol.for("@octanejs/syntax-highlighter:async:state");

export default function createAsyncLoadingHighlighter(options) {
	const {
		loader,
		isLanguageRegistered,
		registerLanguage,
		languageLoaders,
		noAsyncLoadingLanguages,
	} = options;

	function AsyncHighlighter(props) {
		const [, forceUpdate] = useState(0, STATE_SLOT);

		useEffect(
			() => {
				let active = true;
				const refresh = () => {
					if (active) forceUpdate((value) => value + 1);
				};

				const astGeneratorPromise =
					AsyncHighlighter.astGeneratorPromise ||
					AsyncHighlighter.loadAstGenerator();
				if (!AsyncHighlighter.astGenerator)
					astGeneratorPromise.then(refresh, () => {});

				if (
					props.language !== "text" &&
					languageLoaders &&
					!AsyncHighlighter.isRegistered(props.language)
				) {
					AsyncHighlighter.loadLanguage(props.language)
						.then(refresh)
						.catch(() => {});
				}

				return () => {
					active = false;
				};
			},
			undefined,
			EFFECT_SLOT,
		);

		const language = AsyncHighlighter.isSupportedLanguage(props.language)
			? props.language
			: "text";
		return createElement(AsyncHighlighter.highlightInstance, {
			...props,
			language,
			astGenerator: AsyncHighlighter.astGenerator,
		});
	}

	Object.assign(AsyncHighlighter, {
		astGenerator: null,
		highlightInstance: highlight(null, {}),
		astGeneratorPromise: null,
		languages: new Map(),
		supportedLanguages:
			options.supportedLanguages || Object.keys(languageLoaders || {}),
		preload() {
			return AsyncHighlighter.loadAstGenerator();
		},
		async loadLanguage(language) {
			const languageLoader = languageLoaders?.[language];
			if (typeof languageLoader === "function") {
				return languageLoader(AsyncHighlighter.registerLanguage);
			}
			throw new Error(`Language ${language} not supported`);
		},
		isSupportedLanguage(language) {
			return (
				AsyncHighlighter.isRegistered(language) ||
				typeof languageLoaders?.[language] === "function"
			);
		},
		isRegistered(language) {
			if (noAsyncLoadingLanguages) return true;
			if (!registerLanguage) {
				throw new Error(
					"Current syntax highlighter doesn't support registration of languages",
				);
			}
			if (!AsyncHighlighter.astGenerator)
				return AsyncHighlighter.languages.has(language);
			return isLanguageRegistered(AsyncHighlighter.astGenerator, language);
		},
		registerLanguage(name, language) {
			if (!registerLanguage) {
				throw new Error(
					"Current syntax highlighter doesn't support registration of languages",
				);
			}
			if (AsyncHighlighter.astGenerator) {
				return registerLanguage(AsyncHighlighter.astGenerator, name, language);
			}
			AsyncHighlighter.languages.set(name, language);
		},
		loadAstGenerator() {
			AsyncHighlighter.astGeneratorPromise = loader().then(
				(astGenerator) => {
					AsyncHighlighter.astGenerator = astGenerator;
					if (registerLanguage) {
						AsyncHighlighter.languages.forEach((language, name) =>
							registerLanguage(astGenerator, name, language),
						);
					}
				},
				(error) => {
					AsyncHighlighter.astGeneratorPromise = null;
					throw error;
				},
			);
			return AsyncHighlighter.astGeneratorPromise;
		},
	});

	return AsyncHighlighter;
}
