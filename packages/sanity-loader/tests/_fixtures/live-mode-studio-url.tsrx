import type { UseLiveModeHook } from '@octanejs/sanity-loader';

interface LiveModeStudioUrlProps {
	useLiveMode: UseLiveModeHook;
	options: Parameters<UseLiveModeHook>[0];
}

export function LiveModeStudioUrl({ useLiveMode, options }: LiveModeStudioUrlProps) @{
	useLiveMode(options);

	<output />
}
