import { useContext, useEffect, useMemo, useRef, useState } from 'octane';
import type { BundledLanguage } from 'shiki';
import { StreamdownContext } from '../../index.tsrx';
import { useCodePlugin } from '../plugin-context.tsrx';
import type { CodeHighlighterPlugin, HighlightResult, ThemeInput } from '../plugin-types';
import type { HTMLAttributes } from '../types';
import { CodeBlockBody } from './body.tsrx';

type HighlightedCodeBlockBodyProps =
	HTMLAttributes<HTMLDivElement> & {
		code: string;
		language: string;
		raw: HighlightResult;
		startLine?: number;
		lineNumbers?: boolean;
	};

type HighlightRequest = {
	code: string;
	language: string;
	plugin: CodeHighlighterPlugin | null;
	themes: [ThemeInput, ThemeInput];
};

type HighlightState = {
	request: HighlightRequest;
	result: HighlightResult;
};

export const HighlightedCodeBlockBody = ({
	code,
	language,
	raw,
	className,
	startLine,
	lineNumbers,
	...rest
}: HighlightedCodeBlockBodyProps) => {
	const { shikiTheme } = useContext(StreamdownContext);
	const codePlugin = useCodePlugin();
	const request = useMemo<HighlightRequest>(
		() => ({ code, language, plugin: codePlugin, themes: shikiTheme }),
		[code, language, codePlugin, shikiTheme],
	);
	const [highlight, setHighlight] = useState<HighlightState>({
		request,
		result: raw,
	});
	const requestRef = useRef(request);
	requestRef.current = request;
	// A callback for an older streaming revision can resolve after props advance.
	// Show the latest raw source until a result with the same request identity lands.
	const result =
		highlight.request === request ? highlight.result : raw;

	useEffect(() => {
		const commit = (nextResult: HighlightResult) => {
			if (requestRef.current !== request) return;
			setHighlight({ request, result: nextResult });
		};
		if (!request.plugin) {
			commit(raw);
			return;
		}

		const cachedResult = request.plugin.highlight(
			{
				code: request.code,
				language: request.language as BundledLanguage,
				themes: request.themes,
			},
			commit,
		);

		if (cachedResult) commit(cachedResult);
	}, [request, raw]);

	return <CodeBlockBody
		className={className}
		language={language}
		lineNumbers={lineNumbers}
		result={result}
		startLine={startLine}
		{...rest}
	/>;
};
