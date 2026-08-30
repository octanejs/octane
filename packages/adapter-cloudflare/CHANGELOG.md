# @octanejs/adapter-cloudflare

## 0.0.40

### Patch Changes

- @octanejs/app-core@0.0.46

## 0.0.39

### Patch Changes

- Updated dependencies [8adc693]
  - @octanejs/app-core@0.0.45

## 0.0.38

### Patch Changes

- Updated dependencies [9dda682]
  - @octanejs/app-core@0.0.44

## 0.0.37

### Patch Changes

- Updated dependencies [60581f4]
- Updated dependencies [7a639fd]
  - @octanejs/app-core@0.0.43

## 0.0.36

### Patch Changes

- @octanejs/app-core@0.0.42

## 0.0.35

### Patch Changes

- @octanejs/app-core@0.0.41

## 0.0.34

### Patch Changes

- @octanejs/app-core@0.0.40

## 0.0.33

### Patch Changes

- @octanejs/app-core@0.0.39

## 0.0.32

### Patch Changes

- Updated dependencies [afa3722]
  - @octanejs/app-core@0.0.38

## 0.0.31

### Patch Changes

- @octanejs/app-core@0.0.37

## 0.0.30

### Patch Changes

- @octanejs/app-core@0.0.36

## 0.0.29

### Patch Changes

- @octanejs/app-core@0.0.35

## 0.0.28

### Patch Changes

- @octanejs/app-core@0.0.34

## 0.0.27

### Patch Changes

- @octanejs/app-core@0.0.33

## 0.0.26

### Patch Changes

- @octanejs/app-core@0.0.32

## 0.0.25

### Patch Changes

- @octanejs/app-core@0.0.31

## 0.0.24

### Patch Changes

- @octanejs/app-core@0.0.30

## 0.0.23

### Patch Changes

- @octanejs/app-core@0.0.29

## 0.0.22

### Patch Changes

- @octanejs/app-core@0.0.28

## 0.0.21

### Patch Changes

- @octanejs/app-core@0.0.27

## 0.0.20

### Patch Changes

- @octanejs/app-core@0.0.26

## 0.0.19

### Patch Changes

- @octanejs/app-core@0.0.25

## 0.0.18

### Patch Changes

- @octanejs/app-core@0.0.24

## 0.0.17

### Patch Changes

- @octanejs/app-core@0.0.23

## 0.0.16

### Patch Changes

- @octanejs/app-core@0.0.22

## 0.0.15

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/app-core@0.0.21

## 0.0.14

### Patch Changes

- @octanejs/app-core@0.0.20

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
