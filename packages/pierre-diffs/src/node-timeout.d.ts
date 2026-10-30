// @pierre/diffs 1.6.1 declares `ScrollSyncManager.timeoutId: NodeJS.Timeout`
// without depending on @types/node, so a browser program (`types: []`) cannot
// load its declarations. This empty interface merges with @types/node's.
declare global {
	namespace NodeJS {
		interface Timeout {}
	}
}

export {};
