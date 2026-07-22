import { installLynxMainThread } from '@octanejs/lynx/main-thread';

// The background-rendered preview owns no authored first tree. Its small main
// program only receives and applies acknowledged background host batches.
installLynxMainThread();
