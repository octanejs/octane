export type ExportedTemplate = {
	sourcePath: string;
	relativePath: string;
};

export type ExportTemplatesOptions = {
	pretty?: boolean;
	extension?: string;
};

/**
 * Compile and export every default-exported `.tsrx` email beneath `emailsDirectoryPath`.
 * Nested paths are retained and `static/` is copied without entering the compiler graph.
 */
export function exportTemplates(
	outputDirectoryPath: string,
	emailsDirectoryPath: string,
	options?: ExportTemplatesOptions,
): Promise<{ templates: ExportedTemplate[]; outputDirectory: string }>;
