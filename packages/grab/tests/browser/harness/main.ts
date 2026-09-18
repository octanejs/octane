import { getGlobalApi, init } from '@octanejs/grab';

const api = getGlobalApi() ?? init();

(globalThis as typeof globalThis & { __grab: typeof api }).__grab = api;
