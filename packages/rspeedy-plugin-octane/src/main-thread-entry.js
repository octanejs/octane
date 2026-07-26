import { installLynxMainThread } from '@octanejs/lynx/main-thread';

import { installMainThreadProcessData } from './main-thread-process-data.js';

// Lynx invokes this framework hook before dispatching its public render/update
// lifecycle events. Octane consumes those events directly, so its processor is
// intentionally the identity function.
installMainThreadProcessData();
installLynxMainThread({ firstScreen: true, firstScreenSync: 'manual' });
