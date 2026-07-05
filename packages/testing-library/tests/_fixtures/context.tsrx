import { createContext } from 'octane';

// renderHook `wrapper` fixture (renderHook.js:53): a provider component the
// harness renders AROUND the hook host, so the hook reads the provided value.
export const LocaleCtx = createContext('en');

export function FrenchProvider(props) @{
	<LocaleCtx.Provider value="fr">{props.children}</LocaleCtx.Provider>
}
