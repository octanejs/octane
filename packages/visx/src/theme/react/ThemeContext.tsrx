import { createContext } from 'octane';
import createRuntimeTheme from '../runtime/createRuntimeTheme';
import type { VisxThemeRuntime } from '../tokens/types';

const ThemeContext = createContext<VisxThemeRuntime>(createRuntimeTheme('auto'));

export default ThemeContext
