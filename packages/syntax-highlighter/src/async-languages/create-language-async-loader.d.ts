declare const loaders: Record<
	string,
	(registerLanguage: (name: string, language: any) => void) => Promise<void>
>;
export default loaders;
