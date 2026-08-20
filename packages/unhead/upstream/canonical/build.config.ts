import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  clean: true,
  declaration: true,
  externals: [
    'react',
    'vite',
    'webpack',
    'unplugin',
    'magic-string',
    'oxc-walker',
    '@unhead/bundler',
    '@unhead/bundler/vite',
    '@unhead/bundler/framework',
  ],
  rollup: {
    inlineDependencies: true,
    emitCJS: false,
  },
  entries: [
    { input: 'src/index', name: 'index' },
    { input: 'src/server', name: 'server' },
    { input: 'src/client', name: 'client' },
    { input: 'src/stream/server', name: 'stream/server' },
    { input: 'src/stream/client', name: 'stream/client' },
    { input: 'src/utils', name: 'utils' },
    { input: 'src/plugins', name: 'plugins' },
    { input: 'src/bundler', name: 'bundler' },
    { input: 'src/vite', name: 'vite' },
    { input: 'src/stream/vite', name: 'stream/vite' },
    { input: 'src/helmet', name: 'helmet' },
  ],
})
