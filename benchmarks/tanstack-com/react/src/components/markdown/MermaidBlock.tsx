import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { CodeBlockView } from './CodeBlockView';
import { buildPlainCodeBlockHtml } from './codeBlock.shared';

type MermaidRenderState =
	| {
			status: 'loading';
			svg?: undefined;
	  }
	| {
			status: 'rendered';
			svg: string;
	  }
	| {
			status: 'error';
			svg?: undefined;
	  };

function getIsDarkMode() {
	return document.documentElement.classList.contains('dark');
}

function useIsDarkMode() {
	const [isDark, setIsDark] = React.useState(false);

	React.useEffect(() => {
		const updateIsDark = () => setIsDark(getIsDarkMode());
		updateIsDark();

		const observer = new MutationObserver(updateIsDark);
		observer.observe(document.documentElement, {
			attributeFilter: ['class'],
			attributes: true,
		});

		return () => observer.disconnect();
	}, []);

	return isDark;
}

export function MermaidBlock({
	className,
	code,
	isEmbedded,
	showTypeCopyButton,
	style,
	title,
}: {
	className?: string;
	code: string;
	isEmbedded?: boolean;
	showTypeCopyButton?: boolean;
	style?: React.CSSProperties;
	title?: string;
}) {
	const isDark = useIsDarkMode();
	const reactId = React.useId();
	const mermaidId = React.useMemo(
		() => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
		[reactId],
	);
	const [renderState, setRenderState] = React.useState<MermaidRenderState>({
		status: 'loading',
	});

	React.useEffect(() => {
		let cancelled = false;

		async function renderMermaid() {
			setRenderState({ status: 'loading' });

			try {
				const mermaid = (await import('mermaid')).default;

				mermaid.initialize({
					securityLevel: 'strict',
					startOnLoad: false,
					theme: isDark ? 'dark' : 'default',
				});

				const { svg } = await mermaid.render(mermaidId, code);

				if (!cancelled) {
					setRenderState({ status: 'rendered', svg });
				}
			} catch {
				if (!cancelled) {
					setRenderState({ status: 'error' });
				}
			}
		}

		void renderMermaid();

		return () => {
			cancelled = true;
		};
	}, [code, isDark, mermaidId]);

	if (renderState.status !== 'rendered') {
		return (
			<CodeBlockView
				className={className}
				copyText={code.trimEnd()}
				htmlMarkup={buildPlainCodeBlockHtml(code)}
				isEmbedded={isEmbedded}
				lang="mermaid"
				showTypeCopyButton={showTypeCopyButton}
				style={style}
				title={title}
			/>
		);
	}

	return (
		<div
			className={twMerge(
				'mermaid-block not-prose w-full max-w-full overflow-x-auto rounded-md border border-gray-500/20 bg-white p-4 dark:bg-gray-950 [&_svg]:mx-auto [&_svg]:max-w-none',
				className,
			)}
			style={style}
			role="img"
			aria-label={title ?? 'Mermaid diagram'}
			dangerouslySetInnerHTML={{ __html: renderState.svg }}
		/>
	);
}
