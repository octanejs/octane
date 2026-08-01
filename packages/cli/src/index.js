export { main, VERSION } from './kernel/main.js';
// A caller that drives `main` needs the same answer the CLI gives itself about
// whether it can prompt, rather than a second copy of the rule that drifts.
export { resolveMode } from './kernel/ui.js';
export { defineCommand } from './kernel/command.js';
export { CliError, EXIT } from './kernel/errors.js';
export { detectProject } from './kernel/project.js';
export { PACKAGE_MANAGERS } from './kernel/install.js';
