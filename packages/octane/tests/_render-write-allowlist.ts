/**
 * Render-time DOM writes the strict check (_render-write-guard.ts) tolerates
 * until their fix lands. Each entry names a test file (relative to
 * packages/octane/tests), the runtime writer that writes, its owner and why.
 * Any other write fails. The list must be empty before the redesign ships.
 */
export interface RenderWriteAllowance {
	file: string;
	writer: string;
	owner: string;
	reason: string;
}

export const RENDER_WRITE_ALLOWLIST: readonly RenderWriteAllowance[] = [];
