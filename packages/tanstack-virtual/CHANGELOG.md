# @octanejs/tanstack-virtual

## 0.1.10

### Patch Changes

- Updated dependencies [a719b93]
- Updated dependencies [19c3ff1]
- Updated dependencies [6cecb47]
- Updated dependencies [d6ee673]
- Updated dependencies [9b6cd79]
- Updated dependencies [40d562b]
- Updated dependencies [3ffce4c]
- Updated dependencies [b92d76e]
- Updated dependencies [f325775]
- Updated dependencies [c36608c]
- Updated dependencies [5974429]
- Updated dependencies [af337d0]
- Updated dependencies [b5b5880]
  - octane@0.1.13

## 0.1.9

### Patch Changes

- Updated dependencies [a88f9ea]
- Updated dependencies [443bba7]
- Updated dependencies [d388e80]
- Updated dependencies [2f2a204]
- Updated dependencies [0223241]
- Updated dependencies [f9234f6]
- Updated dependencies [fa11116]
- Updated dependencies [ec7ffbf]
- Updated dependencies [25d266b]
- Updated dependencies [d388e80]
  - octane@0.1.12

## 0.1.8

### Patch Changes

- Updated dependencies [f7e1cba]
- Updated dependencies [082b681]
- Updated dependencies [9d86d20]
- Updated dependencies [082b681]
- Updated dependencies [742ae9d]
- Updated dependencies [2932a23]
- Updated dependencies [e0c2f09]
- Updated dependencies [082b681]
- Updated dependencies [082b681]
  - octane@0.1.11

## 0.1.7

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10

## 0.1.6

### Patch Changes

- Updated dependencies [c704664]
- Updated dependencies [5b7d9ed]
- Updated dependencies [5b7d9ed]
- Updated dependencies [91b5f45]
- Updated dependencies [c16778a]
- Updated dependencies [39f2c00]
- Updated dependencies [aabf79c]
- Updated dependencies [07511e4]
- Updated dependencies [5b7d9ed]
- Updated dependencies [0d2e265]
- Updated dependencies [3168360]
- Updated dependencies [81c8842]
  - octane@0.1.9

## 0.1.5

### Patch Changes

- Updated dependencies [156f213]
- Updated dependencies [2a5f44f]
- Updated dependencies [f8e94f2]
- Updated dependencies [a12a3d9]
- Updated dependencies [1b21731]
- Updated dependencies [7a123d2]
- Updated dependencies [95b3081]
- Updated dependencies [38d95eb]
- Updated dependencies [ba36091]
- Updated dependencies [6ccdbce]
- Updated dependencies [d1bb5c3]
- Updated dependencies [9c21887]
- Updated dependencies [674f1a4]
- Updated dependencies [6ceab55]
- Updated dependencies [3445fa6]
- Updated dependencies [6cfb63d]
- Updated dependencies [c68562b]
- Updated dependencies [4de2b4f]
- Updated dependencies [6868005]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [1b21731]
- Updated dependencies [7efdbdd]
- Updated dependencies [314b38d]
- Updated dependencies [dcd2707]
- Updated dependencies [d63b0d0]
- Updated dependencies [39e779c]
- Updated dependencies [1b21731]
- Updated dependencies [f07c628]
- Updated dependencies [fac1c66]
- Updated dependencies [dbbcee1]
- Updated dependencies [5287eac]
  - octane@0.1.8

## 0.1.4

### Patch Changes

- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7

## 0.1.3

### Patch Changes

- d173805: Preserve compiler-driven state-hook getters on client and server while keeping
  getter-free calls on the existing two-item path, including bounded server
  render-phase updates and immediate getter reads. Isolate `useId` by root with
  working identifier prefixes. Harden first-reveal ViewTransitions and compiler
  hook discovery for aliases, namespaces, dependency inference, and plain-loop
  errors.

  Consume Octane as an exact singleton peer from every framework binding and
  publish a Node 22 minimum engine requirement across core and the bindings.
  Compile installed raw-source binding graphs through Vite while preserving
  manifest-declared manual hook-slot directories.

- Updated dependencies [d173805]
- Updated dependencies [85e589e]
- Updated dependencies [2979f42]
- Updated dependencies [b41a91a]
- Updated dependencies [e55f6ed]
- Updated dependencies [d173805]
- Updated dependencies [813fd50]
  - octane@0.1.6

## 0.1.2

### Patch Changes

- Updated dependencies [940ae5a]
- Updated dependencies [6fceaf3]
- Updated dependencies [62da8cc]
- Updated dependencies [e737057]
  - octane@0.1.5

## 0.1.1

### Patch Changes

- 6b7b727: New binding: TanStack Virtual for octane. The framework-agnostic `@tanstack/virtual-core` is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`) is transcribed onto octane hooks preserving upstream's force-update + flushSync-on-sync-scroll wiring and three-layout-effect lifecycle. Differential-verified byte-identical against real @tanstack/react-virtual 3.14.5 on React across scrolling, count changes, horizontal mode, and dynamic measurement.
- Updated dependencies [05fdef8]
- Updated dependencies [e9ebfbf]
- Updated dependencies [4ac4c98]
- Updated dependencies [c2129eb]
- Updated dependencies [4ac4c98]
- Updated dependencies [8a44bb5]
- Updated dependencies [6b0c244]
- Updated dependencies [d3cf678]
- Updated dependencies [05fdef8]
- Updated dependencies [d19d4f3]
- Updated dependencies [7e84258]
- Updated dependencies [2f8c6ed]
- Updated dependencies [8de4584]
- Updated dependencies [9be6ba5]
- Updated dependencies [db409de]
- Updated dependencies [4f3c6c8]
- Updated dependencies [62c3c4e]
- Updated dependencies [3c56d95]
- Updated dependencies [4c5b1d0]
- Updated dependencies [b732399]
- Updated dependencies [6d27cb0]
- Updated dependencies [a3784b1]
- Updated dependencies [fa77edf]
- Updated dependencies [f5c9dba]
- Updated dependencies [12d5410]
- Updated dependencies [d71f1fc]
- Updated dependencies [2f8c6ed]
- Updated dependencies [63e51e8]
- Updated dependencies [6d3b269]
- Updated dependencies [b171c6d]
- Updated dependencies [7f3d9c9]
- Updated dependencies [820baaf]
- Updated dependencies [c36cb32]
- Updated dependencies [c33f409]
- Updated dependencies [63e51e8]
- Updated dependencies [8fc8554]
- Updated dependencies [569daad]
- Updated dependencies [6b7b727]
- Updated dependencies [2ce7bc5]
- Updated dependencies [c6a23f5]
- Updated dependencies [c93aad5]
- Updated dependencies [2942afb]
- Updated dependencies [388b23c]
- Updated dependencies [352cff1]
- Updated dependencies [c7989eb]
- Updated dependencies [dda2854]
- Updated dependencies [dda2854]
- Updated dependencies [3a9d855]
- Updated dependencies [1f85217]
  - octane@0.1.4
