# @octanejs/ink

## 0.0.13

### Patch Changes

- da155ad: Skip splitting an unchanged terminal frame when only Ink's cursor position moved.

  Both standard and incremental rendering already retain the previous frame's line
  geometry, but cursor-only updates rebuilt the entire line array before discarding
  it. Reusing the retained geometry preserves the emitted escape sequences while
  removing that whole-frame allocation. In the `ink-cursor-update` benchmark, 80
  cursor moves over separately materialized equal 20,000-line frames dropped from
  25.3 ms to 4.5 ms in both modes, with initial and changed-output rendering
  unchanged.

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.12

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49

## 0.0.11

### Patch Changes

- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [8a8afd8]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48

## 0.0.10

### Patch Changes

- Updated dependencies [af0d999]
- Updated dependencies [c800a1f]
- Updated dependencies [c1bb057]
- Updated dependencies [97b9349]
- Updated dependencies [4393bea]
- Updated dependencies [7dfef16]
- Updated dependencies [7e62361]
- Updated dependencies [964783a]
- Updated dependencies [d3dbd78]
  - octane@0.1.47

## 0.0.9

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46

## 0.0.8

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45

## 0.0.7

### Patch Changes

- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44

## 0.0.6

### Patch Changes

- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43

## 0.0.5

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42

## 0.0.4

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41

## 0.0.3

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40

## 0.0.2

### Patch Changes

- 0613586: Port Ink 7.1.1 to Octane's native universal renderer with terminal components,
  hooks, Yoga layout, ANSI output, interactive rendering, and string rendering.
- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39
