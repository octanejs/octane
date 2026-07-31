import { createContext, useContext } from 'octane';

interface CodeBlockContextType {
	code: string;
}

export const CodeBlockContext = createContext<CodeBlockContextType>({
	code: '',
});

export const useCodeBlockContext = () => useContext(CodeBlockContext);
