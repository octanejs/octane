import { createContext, useContext, useState, type PropsWithChildren } from 'react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<Theme>('light');

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>('light');
  return (
    <ThemeContext.Provider value={theme}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Toggle</button>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeLabel() {
  return (
    <div>
      <ThemeContext.Consumer>{(theme) => <span>Theme: {theme}</span>}</ThemeContext.Consumer>
    </div>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
