// Build-time-replaceable `process.env` reads (VERSION, NODE_ENV, IS_DEMO,
// REACT_GRAB_SOURCE_LOCATIONS) — not a Node.js runtime dependency. Declare the
// minimal shape so authored source typechecks without `@types/node`.
declare namespace NodeJS {
	interface ProcessEnv {
		[key: string]: string | undefined;
	}

	interface Process {
		env: ProcessEnv;
	}
}

declare var process: NodeJS.Process;
