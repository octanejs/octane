// The `process.env` reads in this package (SC_ATTR / REACT_APP_SC_ATTR /
// NODE_ENV / SC_DISABLE_SPEEDY) are build-time-replaceable globals guarded by
// `typeof process !== 'undefined'` checks — not a Node.js dependency. Declare
// the minimal shape here so the package typechecks without @types/node; when
// @types/node IS in the program these declarations merge with its identical
// `var process: NodeJS.Process` global.
declare namespace NodeJS {
	interface ProcessEnv {
		[key: string]: string | undefined;
	}

	interface Process {
		env: ProcessEnv;
	}
}

declare var process: NodeJS.Process;
