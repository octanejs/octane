import '@testing-library/jest-dom/vitest';

// Ported suites use the side-effect-free testing-library entry semantics.
process.env.RTL_SKIP_AUTO_CLEANUP = 'true';
