import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import type { Library, LibraryId } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { useCopyButton } from '~/components/CopyMarkdownButton';
import { useToast } from '~/components/ToastProvider';
import { Check, Copy } from 'lucide-react';
import { Card } from '~/components/Card';
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
				<div className="font-medium">Copied package name</div>
				<div className="text-gray-500 dark:text-gray-400 text-xs">
					{packageName} copied to clipboard
				</div>
			</div>,
		);
	});

	const installationPath = getFrameworkDocsPath(framework.value, library);
	const installationHash = getFrameworkDocsHash(framework.value, library);

	return (
		<Card
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
				<div className="shrink-0 flex justify-center">
					<img
						src={framework.logo}
						alt={framework.label}
						loading="lazy"
						className="w-16 h-16 object-contain transition-transform duration-300 group-hover:scale-110"
					/>
				</div>

				{/* Framework Name */}
				<div className="text-center flex-1 flex items-center justify-center">
					<div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
						{framework.label}
					</div>
				</div>
			</Link>

			{/* Package Name with Copy Button - Bottom of Card */}
			<div className="pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2">
				<div className="flex items-center justify-center gap-2">
					<code className="text-xs text-gray-600 dark:text-gray-400 font-mono">{packageName}</code>
					<button
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onCopyClick(e);
						}}
						className="shrink-0 p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-800"
						title="Copy package name"
					>
						{copied ? (
							<Check className="w-3 h-3 text-green-600 dark:text-green-400" />
						) : (
							<Copy className="w-3 h-3" />
						)}
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
				className={twMerge(
					'absolute bottom-0 left-0 right-0 h-1 rounded-b-lg',
					'transition-opacity duration-300',
					'opacity-0 group-hover:opacity-100',
					framework.color,
				)}
			/>
		</Card>
	);
}
