import { createContext, useContext, useState, type PropsWithChildren } from 'octane';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<Theme>('light');

export function ThemeProvider({ children }: PropsWithChildren) @{
  const [theme, setTheme] = useState<Theme>('light');
  <ThemeContext value={theme}>
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Toggle</button>
    {children}
  </ThemeContext>
}

export function ThemeLabel() @{
  <div>
    @{ const theme = useContext(ThemeContext); <span>Theme: {theme}</span> }
  </div>
}

export function useTheme() {
  return useContext(ThemeContext);
}
