import { octane } from 'octane/compiler/vite';
export default { plugins: [octane({ hmr: false })], build: { target: 'es2022' } };
