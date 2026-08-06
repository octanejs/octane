/* global __OCTANE_LYNX_FIRST_SCREEN_RENDER__ */
import { installLynxMainThread } from '@octanejs/lynx/main-thread';

import { installMainThreadProcessData } from './main-thread-process-data.js';

// Lynx invokes this framework hook before dispatching its public render/update
// lifecycle events. Octane consumes those events directly, so its processor is
// intentionally the identity function.
installMainThreadProcessData();
installLynxMainThread({
	firstScreen: true,
	firstScreenSync: 'manual',
	// The plugin defines __OCTANE_LYNX_FIRST_SCREEN_RENDER__ per platform: 'engine'
	// on native (defer to the engine's __RenderPage lifecycle so elements see the
	// decoded PageConfig), 'immediate' on Lynx for Web (no __RenderPage, no
	// config-gated overflow default, so paint during evaluation instead of
	// coupling the first screen to the readiness handshake). Falls back to 'engine'
	// if the entry is bundled without the define.
	firstScreenRender:
		typeof __OCTANE_LYNX_FIRST_SCREEN_RENDER__ === 'string'
			? __OCTANE_LYNX_FIRST_SCREEN_RENDER__
			: 'engine',
});
