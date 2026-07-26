process.env.OCTANE_RUNTIME_STRESS_SUITE = 'external-store-fanout';
await import('../news/runtime-stress.mjs');
