export { main, VERSION } from './kernel/main.js';
export { defineCommand } from './kernel/command.js';
export { CliError, EXIT } from './kernel/errors.js';
export { detectProject, findRoot, scanSourceFiles } from './kernel/project.js';
