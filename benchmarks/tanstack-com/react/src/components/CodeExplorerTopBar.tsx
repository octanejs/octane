import React from 'react';
import {
	ArrowLeftFromLine,
	ArrowRightFromLine,
	Maximize,
	Minimize,
	TextAlignStart,
} from 'lucide-react';

interface CodeExplorerTopBarProps {
	activeTab: 'code' | 'sandbox';
	isFullScreen: boolean;
	isSidebarOpen: boolean;
	setActiveTab: (tab: 'code' | 'sandbox') => void;
	setIsFullScreen: React.Dispatch<React.SetStateAction<boolean>>;
	setIsSidebarOpen: (isOpen: boolean) => void;
}

export function CodeExplorerTopBar({
	activeTab,
	isFullScreen,
	isSidebarOpen,
	setActiveTab,
	setIsFullScreen,
	setIsSidebarOpen,
}: CodeExplorerTopBarProps) {
	return (
		<div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700">
			<div className="flex items-center gap-2 px-1">
				{activeTab === 'code' ? (
					isSidebarOpen ? (
						<button
							onClick={() => setIsSidebarOpen(!isSidebarOpen)}
							className="p-2 text-sm rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
							title={'Hide sidebar'}
						>
							<ArrowLeftFromLine className="w-4 h-4" />
						</button>
					) : (
						<button
							onClick={() => setIsSidebarOpen(!isSidebarOpen)}
							className="p-2 text-sm rounded transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
							title={'Show sidebar'}
						>
							<ArrowRightFromLine className="w-4 h-4" />
						</button>
					)
				) : (
					<div className="p-2 text-sm rounded" aria-hidden>
						<TextAlignStart className="w-4 h-4 text-transparent" aria-hidden />
					</div>
				)}
				<button
					onClick={() => setActiveTab('code')}
					className={`px-4 py-2 text-sm font-medium transition-colors relative ${
						activeTab === 'code'
							? 'text-gray-900 dark:text-white'
							: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
					}`}
				>
					<span className="hidden sm:inline">Code Explorer</span>
					<span className="sm:hidden">Code</span>
					{activeTab === 'code' ? (
						<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
					) : (
						<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent" />
					)}
				</button>
				<button
					onClick={() => setActiveTab('sandbox')}
					className={`px-4 py-2 text-sm font-medium transition-colors relative ${
						activeTab === 'sandbox'
							? 'text-gray-900 dark:text-white'
							: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
					}`}
				>
					<span className="hidden sm:inline">Interactive Sandbox</span>
					<span className="sm:hidden">Sandbox</span>
					{activeTab === 'sandbox' ? (
						<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
					) : (
						<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent" />
					)}
				</button>
			</div>
			<div className="flex items-center gap-2">
				<button
					onClick={() => {
						setIsFullScreen((prev) => !prev);
					}}
					className={`p-2 text-sm rounded transition-colors mr-2 hover:bg-gray-200 dark:hover:bg-gray-700 ${
						activeTab === 'code'
							? 'text-gray-600 dark:text-gray-400'
							: 'text-gray-400 dark:text-gray-600'
					}`}
					title={isFullScreen ? 'Exit full screen' : 'Enter full screen'}
				>
					{isFullScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
				</button>
			</div>
		</div>
	);
}
