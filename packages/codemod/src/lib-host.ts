import ts from 'typescript';

const LIB_DIR = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, '');
const libs = new Map<string, ts.SourceFile>();

/**
 * A compiler host that parses TypeScript's own `lib.*.d.ts` files once per
 * process and shares them between programs, as a language service's document
 * registry does. Every project program would otherwise parse the whole default
 * library, `lib.dom.d.ts` included, again. A declaration file binds the same
 * way under every compiler option, so only the parse settings key the cache.
 */
export function libCachingHost(options: ts.CompilerOptions): ts.CompilerHost {
	const host = ts.createCompilerHost(options);
	const getSourceFile = host.getSourceFile;
	host.getSourceFile = (fileName, settings, onError, shouldCreate) => {
		if (!fileName.startsWith(LIB_DIR) || shouldCreate)
			return getSourceFile.call(host, fileName, settings, onError, shouldCreate);
		const parse = typeof settings === 'object' ? settings : { languageVersion: settings };
		const key = `${parse.languageVersion}:${parse.impliedNodeFormat}:${parse.jsDocParsingMode}:${fileName}`;
		let file = libs.get(key);
		if (file === undefined) {
			file = getSourceFile.call(host, fileName, settings, onError);
			if (file !== undefined) libs.set(key, file);
		}
		return file;
	};
	return host;
}
