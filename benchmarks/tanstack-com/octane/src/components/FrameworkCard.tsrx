import { Link } from '@octanejs/tanstack-router';
import { twMerge } from 'tailwind-merge';
import type { Library, LibraryId } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { useCopyButton } from '~/components/CopyMarkdownButton';
import { useToast } from '~/components/ToastProvider.tsrx';
import { Check, Copy } from '@octanejs/lucide';
import { Card } from '~/components/Card.tsrx';
import { getFrameworkDocsHash, getFrameworkDocsPath } from '~/libraries/frameworkSupport';
import { copyTextToClipboard } from '~/utils/browser-effects';

export function FrameworkCard({
	framework,
	libraryId,
	version,
	packageName,
	index,
	library,
}: {
	framework: ReturnType<typeof getFrameworkOptions>[number];
	libraryId: LibraryId;
	version: string;
	packageName: string;
	index: number;
	library: Library;
}) {
	const { notify } = useToast();
	const [copied, onCopyClick] = useCopyButton(async () => {
		await copyTextToClipboard(packageName);
		notify(
			<div>
				<div class="font-medium">Copied package name</div>
				<div class="text-gray-500 dark:text-gray-400 text-xs">
					{packageName as string}
					copied to clipboard
				</div>
			</div>,
		);
	});

	const installationPath = getFrameworkDocsPath(framework.value, library);
	const installationHash = getFrameworkDocsHash(framework.value, library);

	return <Card
		className={twMerge(
			'p-6 transition-all duration-300 ease-out',
			'hover:shadow-md',
			'flex flex-col gap-4 group',
			'min-h-[180px]',
			'relative overflow-hidden',
		)}
		style={{
			zIndex: index,
			willChange: 'transform',
		}}
	>
		<Link
			from="/$libraryId/$version/docs"
			to="./$"
			params={{
				libraryId,
				version,
				_splat: installationPath,
			}}
			hash={installationHash}
			className="flex flex-col flex-1 gap-4"
		>
			{/* Framework Logo */}
			<div class="shrink-0 flex justify-center">
				<img
					src={framework.logo}
					alt={framework.label}
					loading="lazy"
					class="w-16 h-16 object-contain transition-transform duration-300 group-hover:scale-110"
				/>
			</div>

			{/* Framework Name */}
			<div class="text-center flex-1 flex items-center justify-center">
				<div class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					{framework.label as string}
				</div>
			</div>
		</Link>

		{/* Package Name with Copy Button - Bottom of Card */}
		<div class="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
			<div class="flex items-center justify-center gap-2">
				<code class="text-xs text-gray-600 dark:text-gray-400 font-mono">
					{packageName as string}
				</code>
				<button
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onCopyClick(e);
					}}
					class="shrink-0 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
					title="Copy package name"
				>
					{copied
						? <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
						: <Copy className="w-3 h-3" />}
				</button>
			</div>
			<Link
				from="/$libraryId/$version/docs"
				to="./$"
				params={{
					libraryId,
					version,
					_splat: installationPath,
				}}
				hash={installationHash}
				className="block w-full text-center text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline transition-colors"
			>
				Full install instructions
			</Link>
		</div>

		{/* Accent indicator */}
		<div
			class={twMerge(
				'absolute bottom-0 left-0 right-0 h-1 rounded-b-lg',
				'transition-opacity duration-300',
				'opacity-0 group-hover:opacity-100',
				framework.color,
			)}
		/>
	</Card>;
}
