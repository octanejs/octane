import { useContext } from 'octane';
import ThemeContext from './ThemeContext.tsrx';
import type { VisxThemeRuntime } from '../tokens/types';

export default function useTheme() {
	return useContext(ThemeContext) as VisxThemeRuntime;
}
