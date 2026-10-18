// Run the driver with a Worker thread spinning for the whole process lifetime.
import { Worker } from "node:worker_threads";
const w = new Worker("for(;;){}", { eval: true });
try { await import("./shell-prof.mjs"); } finally { await w.terminate(); }
