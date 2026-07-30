export type Theme = {
	colors: {
		accentColor: string;
		accentColorForeground: string;
		connectButtonBackground: string;
		connectButtonText: string;
		modalBackground: string;
		modalText: string;
	};
	fonts: { body: string };
	radii: { actionButton: string; connectButton: string; modal: string };
};

type ThemeOptions = {
	accentColor?: string;
	accentColorForeground?: string;
	borderRadius?: 'large' | 'medium' | 'none' | 'small';
	fontStack?: 'rounded' | 'system';
};

const radii = {
	large: '20px',
	medium: '12px',
	none: '0',
	small: '8px',
} as const;

function createTheme(dark: boolean, options: ThemeOptions = {}): Theme {
	const radius = radii[options.borderRadius ?? 'large'];
	return {
		colors: {
			accentColor: options.accentColor ?? '#0e76fd',
			accentColorForeground: options.accentColorForeground ?? '#fff',
			connectButtonBackground: dark ? '#1a1b1f' : '#fff',
			connectButtonText: dark ? '#fff' : '#1a1b1f',
			modalBackground: dark ? '#1a1b1f' : '#fff',
			modalText: dark ? '#fff' : '#1a1b1f',
		},
		fonts: {
			body:
				options.fontStack === 'rounded'
					? 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
					: 'system-ui, sans-serif',
		},
		radii: { actionButton: radius, connectButton: radius, modal: radius },
	};
}

export function lightTheme(options?: ThemeOptions): Theme {
	return createTheme(false, options);
}

export function darkTheme(options?: ThemeOptions): Theme {
	return createTheme(true, options);
}

export function midnightTheme(options?: ThemeOptions): Theme {
	return createTheme(true, {
		accentColor: '#fff',
		accentColorForeground: '#1a1b1f',
		...options,
	});
}

/** Octane extension with a purple rounded preset; not an upstream RainbowKit export. */
export function rainbowTheme(options?: ThemeOptions): Theme {
	return lightTheme({ accentColor: '#7b3fe4', fontStack: 'rounded', ...options });
}
