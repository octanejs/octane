import React from 'react';
import { stackBlitzIframeProps } from '~/utils/stackblitz-embed';

interface InteractiveSandboxProps {
	isActive: boolean;
	codeSandboxUrl: string;
	stackBlitzUrl: string;
	examplePath: string;
	libraryName: string;
	embedEditor: 'codesandbox' | 'stackblitz';
}

export function InteractiveSandbox({
	isActive,
	codeSandboxUrl,
	stackBlitzUrl,
	examplePath,
	libraryName,
	embedEditor,
}: InteractiveSandboxProps) {
	const isStackBlitz = embedEditor === 'stackblitz';

	return (
		<div
			className={`absolute inset-0 ${isActive ? '' : 'pointer-events-none opacity-0'}`}
			aria-hidden={!isActive}
		>
			<iframe
				src={isStackBlitz ? stackBlitzUrl : codeSandboxUrl}
				title={`${libraryName} | ${examplePath}`}
				{...(isStackBlitz ? stackBlitzIframeProps : {})}
				sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
				className="w-full h-full min-h-[80dvh] overflow-hidden shadow-lg bg-white dark:bg-black"
			/>
		</div>
	);
}
