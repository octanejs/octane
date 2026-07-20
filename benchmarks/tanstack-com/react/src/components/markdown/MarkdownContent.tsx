import * as React from 'react';
import { ChevronDown, Copy, SquarePen } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { ButtonGroup } from '~/components/ButtonGroup';
import { DocTitle } from '~/components/DocTitle';
import { DocFeedbackProvider } from '~/components/DocFeedbackProvider';
import { Button } from '~/ui';
import type { SiteMarkdownDocument } from '~/utils/markdown';
import { Markdown } from './Markdown';

const LazyCopyPageDropdown = React.lazy(() =>
	import('~/components/CopyPageDropdown').then((m) => ({
		default: m.CopyPageDropdown,
	})),
);

type MarkdownContentProps = {
	title: string;
	repo: string;
	branch: string;
	filePath: string;
	markdown: SiteMarkdownDocument;
	preserveTabPanels?: boolean;
	/** Additional elements to render in the title bar (e.g., width toggle button) */
	titleBarActions?: React.ReactNode;
	/** Additional class names for the prose container */
	proseClassName?: string;
	/** Ref for the markdown container (used for heading intersection observer in docs) */
	containerRef?: React.RefObject<HTMLDivElement | null>;
	// Feedback props (optional, for docs)
	libraryId?: string;
	libraryVersion?: string;
	pagePath?: string;
	/** Current framework for filtering markdown content */
	currentFramework?: string;
	/** Render the first image in the document as high-priority/eager (e.g. blog post hero images) */
	eagerFirstImage?: boolean;
};

function CopyPageDropdownFallback() {
	return (
		<ButtonGroup>
			<Button variant="ghost" size="xs" rounded="none" className="border-0" disabled>
				<Copy className="w-3 h-3" />
				Copy page
			</Button>
			<Button
				variant="ghost"
				size="xs"
				rounded="none"
				className="border-0 px-1.5"
				disabled
				aria-label="More copy actions"
			>
				<ChevronDown className="w-3 h-3" />
			</Button>
		</ButtonGroup>
	);
}

export function MarkdownContent({
	title,
	repo,
	branch,
	filePath,
	markdown,
	preserveTabPanels,
	titleBarActions,
	proseClassName,
	containerRef,
	libraryId,
	libraryVersion,
	pagePath,
	currentFramework,
	eagerFirstImage,
}: MarkdownContentProps) {
	const [canLoadCopyControls, setCanLoadCopyControls] = React.useState(false);

	React.useEffect(() => {
		setCanLoadCopyControls(true);
	}, []);

	const renderedMarkdown = (
		<Markdown
			document={markdown}
			preserveTabPanels={preserveTabPanels}
			eagerFirstImage={eagerFirstImage}
		/>
	);

	const contentNode =
		libraryId && libraryVersion && pagePath ? (
			<DocFeedbackProvider
				pagePath={pagePath}
				libraryId={libraryId}
				libraryVersion={libraryVersion}
			>
				{renderedMarkdown}
			</DocFeedbackProvider>
		) : (
			renderedMarkdown
		);

	return (
		<>
			{title ? (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<DocTitle>{title}</DocTitle>
					<div
						className="flex items-center gap-2 shrink-0"
						onFocusCapture={() => {
							setCanLoadCopyControls(true);
						}}
						onPointerEnter={() => {
							setCanLoadCopyControls(true);
						}}
						onTouchStart={() => {
							setCanLoadCopyControls(true);
						}}
					>
						{canLoadCopyControls ? (
							<React.Suspense fallback={<CopyPageDropdownFallback />}>
								<LazyCopyPageDropdown
									repo={repo}
									branch={branch}
									filePath={filePath}
									currentFramework={currentFramework}
								/>
							</React.Suspense>
						) : (
							<CopyPageDropdownFallback />
						)}
						{titleBarActions}
					</div>
				</div>
			) : null}
			<div className="h-4" />
			<div className="h-px bg-gray-500 opacity-20" />
			<div className="h-4" />
			<div
				ref={containerRef}
				className={twMerge(
					'prose prose-gray dark:prose-invert max-w-none',
					'[font-size:16px]',
					'styled-markdown-content',
					proseClassName,
				)}
			>
				{contentNode}
			</div>
			<div className="h-12" />
			<div className="w-full h-px bg-gray-500 opacity-30" />
			<div className="flex py-4">
				<Button
					variant="ghost"
					size="xs"
					as="a"
					href={`https://github.com/${repo}/edit/${branch}/${filePath}`}
				>
					<SquarePen className="w-3.5 h-3.5" />
					Edit on GitHub
				</Button>
			</div>
		</>
	);
}
