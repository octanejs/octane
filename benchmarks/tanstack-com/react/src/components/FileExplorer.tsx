import React from 'react';
import typescriptIconUrl from '~/images/file-icons/typescript.svg?url';
import javascriptIconUrl from '~/images/file-icons/javascript.svg?url';
import cssIconUrl from '~/images/file-icons/css.svg?url';
import htmlIconUrl from '~/images/file-icons/html.svg?url';
import jsonIconUrl from '~/images/file-icons/json.svg?url';
import svelteIconUrl from '~/images/file-icons/svelte.svg?url';
import vueIconUrl from '~/images/file-icons/vue.svg?url';
import markoIconUrl from '~/images/file-icons/marko.svg?url';
import emberIconUrl from '~/images/ember-logo.svg?url';
import textIconUrl from '~/images/file-icons/txt.svg?url';
import type { GitHubFileNode } from '~/utils/documents.server';
import { twMerge } from 'tailwind-merge';

const getFileIconPath = (filename: string) => {
	const ext = filename.split('.').pop()?.toLowerCase() || '';

	switch (ext) {
		case 'ts':
		case 'tsx':
			return typescriptIconUrl;
		case 'js':
		case 'jsx':
			return javascriptIconUrl;
		case 'css':
			return cssIconUrl;
		case 'html':
			return htmlIconUrl;
		case 'json':
			return jsonIconUrl;
		case 'svelte':
			return svelteIconUrl;
		case 'vue':
			return vueIconUrl;
		case 'marko':
			return markoIconUrl;
		case 'gjs':
		case 'gts':
			return emberIconUrl;
		default:
			return textIconUrl;
	}
};

const FileIcon = ({ filename }: { filename: string }) => {
	return (
		<img
			src={getFileIconPath(filename)}
			alt={`${filename} file icon`}
			width={16}
			height={16}
			className="inline-block"
		/>
	);
};

const FolderIcon = ({ isOpen }: { isOpen: boolean }) => (
	<svg
		width="16"
		height="16"
		viewBox="0 0 16 16"
		xmlns="http://www.w3.org/2000/svg"
		className="inline-block"
	>
		{isOpen ? (
			// Open folder - with visible opening and perspective
			<>
				<path
					d="M1.5 2h5l1 2h7a1.5 1.5 0 0 1 1.5 1.5V4.5h-14v-2A1.5 1.5 0 0 1 1.5 2z"
					fill="#FFA000"
				/>
				<path d="M0 5l2 7.5a1 1 0 0 0 1 .5h12a1 1 0 0 0 1-.5l2-7.5H0z" fill="#FFCA28" />
			</>
		) : (
			// Closed folder - lighter color and simpler shape
			<path
				d="M.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5H7l-1-2H.5z"
				fill="#FFC107"
			/>
		)}
	</svg>
);

function getMarginLeft(depth: number) {
	return `${depth * 16 + 4}px`;
}

interface FileExplorerProps {
	currentPath: string | null;
	githubContents: GitHubFileNode[] | undefined;
	isSidebarOpen: boolean;
	libraryColor: string;
	prefetchFileContent: (file: string) => void;
	setCurrentPath: (file: string) => void;
}

export function FileExplorer({
	currentPath,
	githubContents,
	isSidebarOpen,
	libraryColor,
	prefetchFileContent,
	setCurrentPath,
}: FileExplorerProps) {
	const [sidebarWidth, setSidebarWidth] = React.useState(220);
	const [isResizing, setIsResizing] = React.useState(false);
	const MIN_SIDEBAR_WIDTH = 60;

	// Initialize expandedFolders with root-level folders
	const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(() => {
		const expanded = new Set<string>();
		if (githubContents) {
			const flattened = recursiveFlattenGithubContents(githubContents);
			if (flattened.every((f) => f.depth === 0)) {
				return expanded;
			}

			// if the currentPath matches, then open
			for (const file of flattened) {
				if (file.path === currentPath) {
					// Open all ancestors directories
					const dirs = flattedOnlyToDirs(githubContents);
					const ancestors = file.path.split('/').slice(0, -1);

					while (ancestors.length > 0) {
						const ancestor = ancestors.join('/');

						if (dirs.some((d) => d.path === ancestor)) {
							expanded.add(ancestor);
							ancestors.pop();
						} else {
							break;
						}
					}

					break;
				}
			}
		}
		return expanded;
	});

	const startResizeRef = React.useRef({
		startX: 0,
		startWidth: 0,
	});

	const startResize = (e: React.MouseEvent | React.TouchEvent) => {
		setIsResizing(true);
		startResizeRef.current = {
			startX: 'touches' in e ? e.touches[0].clientX : e.clientX,
			startWidth: sidebarWidth,
		};
	};

	React.useEffect(() => {
		const handleMouseMove = (e: MouseEvent | TouchEvent) => {
			if (!isResizing) return;

			const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
			const diff = clientX - startResizeRef.current.startX;
			const newWidth = startResizeRef.current.startWidth + diff;

			if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= 600) {
				setSidebarWidth(newWidth);
			} else if (newWidth < MIN_SIDEBAR_WIDTH) {
				setSidebarWidth(MIN_SIDEBAR_WIDTH);
			}
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			if (sidebarWidth <= MIN_SIDEBAR_WIDTH) {
				setSidebarWidth(200);
				const event = new CustomEvent('closeSidebar');
				window.dispatchEvent(event);
			}
		};

		if (isResizing) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			document.addEventListener('touchmove', handleMouseMove);
			document.addEventListener('touchend', handleMouseUp);
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('touchmove', handleMouseMove);
			document.removeEventListener('touchend', handleMouseUp);
		};
	}, [isResizing, sidebarWidth]);

	const toggleFolder = (path: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	if (!githubContents) return null;

	return (
		<>
			<div
				style={{
					width: isSidebarOpen ? sidebarWidth : 0,
					paddingRight: isSidebarOpen ? '0.5rem' : 0,
				}}
				className={`shrink-0 overflow-y-auto bg-linear-to-r from-gray-50 via-gray-50 to-transparent dark:from-gray-800/50 dark:via-gray-800/50 dark:to-transparent shadow-sm ${
					isResizing ? '' : 'transition-all duration-300'
				}`}
			>
				{githubContents && isSidebarOpen ? (
					<div className="p-2">
						<RenderFileTree
							currentPath={currentPath}
							expandedFolders={expandedFolders}
							files={githubContents}
							libraryColor={libraryColor}
							prefetchFileContent={prefetchFileContent}
							setCurrentPath={setCurrentPath}
							toggleFolder={toggleFolder}
						/>
					</div>
				) : null}
			</div>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
			<div
				className={`w-1 cursor-col-resize hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 ${
					isResizing ? '' : 'transition-colors'
				} ${isSidebarOpen ? '' : 'hidden'}`}
				onMouseDown={startResize}
				onTouchStart={startResize}
			/>
		</>
	);
}

const RenderFileTree = (props: {
	files: GitHubFileNode[] | undefined;
	libraryColor: string;
	toggleFolder: (path: string) => void;
	prefetchFileContent: (file: string) => void;
	expandedFolders: Set<string>;
	currentPath: string | null;
	setCurrentPath: (file: string) => void;
}) => {
	const pendingPrefetchesRef = React.useRef<Record<string, number>>({});

	const cancelPrefetch = (path: string) => {
		const timeoutId = pendingPrefetchesRef.current[path];

		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
			delete pendingPrefetchesRef.current[path];
		}
	};

	const schedulePrefetch = (path: string) => {
		cancelPrefetch(path);

		pendingPrefetchesRef.current[path] = window.setTimeout(() => {
			delete pendingPrefetchesRef.current[path];
			props.prefetchFileContent(path);
		}, 180);
	};

	React.useEffect(() => {
		const pendingPrefetches = pendingPrefetchesRef.current;

		return () => {
			for (const timeoutId of Object.values(pendingPrefetches)) {
				window.clearTimeout(timeoutId);
			}
		};
	}, []);

	if (!props.files) return null;

	return (
		<ul className="flex flex-col">
			{props.files.map((file) => (
				<li key={file.path} className="relative">
					{/* Tree lines */}
					{file.depth > 0 && (
						<>
							{/* Vertical line */}
							<div
								className="absolute w-px bg-gray-200 dark:bg-gray-700"
								style={{
									left: `${file.depth * 16 - 9}px`,
									top: 0,
									bottom: 0,
								}}
							/>
							{/* Horizontal line */}
							<div
								className="absolute h-px bg-gray-200 dark:bg-gray-700"
								style={{
									left: `${file.depth * 16 - 9}px`,
									width: '9px',
									top: '50%',
								}}
							/>
						</>
					)}
					<div style={{ paddingLeft: getMarginLeft(file.depth) }}>
						<button
							onClick={() => {
								cancelPrefetch(file.path);

								if (file.type === 'dir') {
									props.toggleFolder(file.path);
								} else {
									props.setCurrentPath(file.path);
								}
							}}
							onMouseEnter={() => {
								if (file.type !== 'dir') {
									schedulePrefetch(file.path);
								}
							}}
							onFocus={() => {
								if (file.type !== 'dir') {
									schedulePrefetch(file.path);
								}
							}}
							onMouseLeave={() => cancelPrefetch(file.path)}
							onBlur={() => cancelPrefetch(file.path)}
							className={twMerge(
								`px-2 py-1.5 text-left w-full flex items-center gap-2 text-sm rounded transition-colors duration-200 min-w-0`,
								props.currentPath === file.path
									? `${props.libraryColor}/20 text-gray-900 dark:text-white shadow-sm`
									: 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400',
							)}
						>
							<span className="shrink-0 select-none">
								{file.type === 'dir' ? (
									<FolderIcon isOpen={props.expandedFolders.has(file.path)} />
								) : (
									<FileIcon filename={file.name} />
								)}
							</span>
							<span className="truncate select-none">{file.name}</span>
						</button>
					</div>
					{file.children && props.expandedFolders.has(file.path) && (
						<RenderFileTree {...props} files={file.children} />
					)}
				</li>
			))}
		</ul>
	);
};

function recursiveFlattenGithubContents(
	nodes: Array<GitHubFileNode>,
	bannedDirs: Set<string> = new Set(),
): Array<GitHubFileNode> {
	return nodes.flatMap((node) => {
		if (node.type === 'dir' && node.children && !bannedDirs.has(node.name)) {
			return recursiveFlattenGithubContents(node.children, bannedDirs);
		}
		return node;
	});
}

function flattedOnlyToDirs(nodes: Array<GitHubFileNode>): Array<GitHubFileNode> {
	return nodes.flatMap((node) => {
		if (node.type === 'dir' && node.children) {
			return [node, ...flattedOnlyToDirs(node.children)];
		}
		return node.type === 'dir' ? [node] : [];
	});
}
