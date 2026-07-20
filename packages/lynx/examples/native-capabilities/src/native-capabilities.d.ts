import type { LynxStandardProps } from '@octanejs/lynx/intrinsics';

declare module '@octanejs/lynx/platform' {
	interface NativeModules {
		readonly OctaneAccountModule: {
			greeting(accountId: string): string;
		};
	}
}

declare module '@octanejs/lynx/intrinsics' {
	interface LynxCustomIntrinsicElements {
		'octane-badge': LynxStandardProps & {
			label: string;
		};
	}
}
