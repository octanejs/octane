# @octanejs/adapter-cloudflare

## 0.0.13

### Patch Changes

- @octanejs/app-core@0.0.19

## 0.0.12

### Patch Changes

- @octanejs/app-core@0.0.18

## 0.0.11

### Patch Changes

- @octanejs/app-core@0.0.17

## 0.0.10

### Patch Changes

- Updated dependencies [89323b7]
- Updated dependencies [89323b7]
- Updated dependencies [0a0b813]
- Updated dependencies [c151b71]
  - @octanejs/app-core@0.0.16

## 0.0.9

### Patch Changes

- @octanejs/app-core@0.0.15

## 0.0.8

### Patch Changes

- @octanejs/app-core@0.0.14

## 0.0.7

### Patch Changes

- Updated dependencies [eb69cb6]
  - @octanejs/app-core@0.0.13

## 0.0.6

### Patch Changes

- @octanejs/app-core@0.0.12

## 0.0.5

### Patch Changes

- @octanejs/app-core@0.0.11

## 0.0.4

### Patch Changes

- Updated dependencies [e19989d]
  - @octanejs/app-core@0.0.10

## 0.0.3

### Patch Changes

- Updated dependencies [3ffce4c]
  - @octanejs/app-core@0.0.9

## 0.0.2

### Patch Changes

- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

- Updated dependencies [a88f9ea]
  - @octanejs/app-core@0.0.8
