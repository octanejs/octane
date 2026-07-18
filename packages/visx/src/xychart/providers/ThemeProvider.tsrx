import type { OctaneNode } from 'octane';
import ThemeContext from '../context/ThemeContext.tsrx';
import type { XYChartTheme } from '../types';
import lightTheme from '../theme/themes/light';

export type ThemeProviderProps = {
	theme?: XYChartTheme;
	children: OctaneNode;
};

export default function ThemeProvider({ theme = lightTheme, children }: ThemeProviderProps) {
	return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
