import type { Theme } from './types';

export const colors = {
	primary: '#2684FF',
	primary75: '#4C9AFF',
	primary50: '#B2D4FF',
	primary25: '#DEEBFF',
	danger: '#DE350B',
	dangerLight: '#FFBDAD',
	neutral0: 'hsl(0, 0%, 100%)',
	neutral5: 'hsl(0, 0%, 95%)',
	neutral10: 'hsl(0, 0%, 90%)',
	neutral20: 'hsl(0, 0%, 80%)',
	neutral30: 'hsl(0, 0%, 70%)',
	neutral40: 'hsl(0, 0%, 60%)',
	neutral50: 'hsl(0, 0%, 50%)',
	neutral60: 'hsl(0, 0%, 40%)',
	neutral70: 'hsl(0, 0%, 30%)',
	neutral80: 'hsl(0, 0%, 20%)',
	neutral90: 'hsl(0, 0%, 10%)',
};

export const spacing = {
	baseUnit: 4,
	controlHeight: 38,
	menuGutter: 8,
};

export const defaultTheme: Theme = {
	borderRadius: 4,
	colors,
	spacing,
};

export type ThemeConfig = Theme | ((theme: Theme) => Theme);
