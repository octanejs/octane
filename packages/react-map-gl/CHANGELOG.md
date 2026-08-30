# @octanejs/react-map-gl

## 0.0.22

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50

## 0.0.21

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [a51c8c6]
  - octane@0.1.49

## 0.0.20

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

## 0.0.19

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

## 0.0.18

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46

## 0.0.17

### Patch Changes

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45

## 0.0.16

### Patch Changes

- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44

## 0.0.15

### Patch Changes

- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43

## 0.0.14

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42

## 0.0.13

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41

## 0.0.12

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40

## 0.0.11

### Patch Changes

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39

## 0.0.10

### Patch Changes

- Updated dependencies [0635af6]
  - octane@0.1.38

## 0.0.9

### Patch Changes

- Updated dependencies [954c75f]
- Updated dependencies [94fa199]
- Updated dependencies [c2e77a3]
- Updated dependencies [125c861]
- Updated dependencies [765134a]
- Updated dependencies [9efd6f4]
- Updated dependencies [603756a]
  - octane@0.1.37

## 0.0.8

### Patch Changes

- Updated dependencies [972fdd3]
- Updated dependencies [4a792e3]
- Updated dependencies [581b8bd]
- Updated dependencies [24aa236]
- Updated dependencies [9c397a2]
- Updated dependencies [24aa236]
- Updated dependencies [5377ef3]
- Updated dependencies [6b65644]
- Updated dependencies [f12a9a9]
- Updated dependencies [972fdd3]
- Updated dependencies [1039b7d]
- Updated dependencies [ffadd39]
- Updated dependencies [a03ff0f]
- Updated dependencies [4c1ecd1]
  - octane@0.1.36

## 0.0.7

### Patch Changes

- Updated dependencies [50b7988]
- Updated dependencies [6daa380]
- Updated dependencies [d2c9e1c]
- Updated dependencies [01240e6]
- Updated dependencies [59a35ae]
- Updated dependencies [a8b432b]
- Updated dependencies [910c240]
- Updated dependencies [db5687e]
- Updated dependencies [e2466a5]
- Updated dependencies [2d06817]
  - octane@0.1.35

## 0.0.6

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34

## 0.0.5

### Patch Changes

- Updated dependencies [1fe297e]
- Updated dependencies [db0d495]
- Updated dependencies [677182d]
- Updated dependencies [3fb96df]
- Updated dependencies [677182d]
- Updated dependencies [4653a2e]
- Updated dependencies [7282555]
- Updated dependencies [3d09348]
- Updated dependencies [8cb40df]
- Updated dependencies [677182d]
- Updated dependencies [fc1c146]
- Updated dependencies [a84fcaa]
- Updated dependencies [217a0b5]
  - octane@0.1.33

## 0.0.4

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32

## 0.0.3

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31

## 0.0.2

### Patch Changes

- 27ff401: Add a Mapbox GL JS binding, ported from `@vis.gl/react-mapbox@8.1.2`.

  `react-map-gl@8` is a re-export shell, so the port targets the package its
  `./mapbox` subpath actually resolves to. All thirteen runtime exports and every
  published type are covered: `Map`, `Marker`, `Popup`, `Source`, `Layer`, the five
  controls, `useControl`, `MapProvider` and `useMap`.

  Fourteen upstream modules carry no React import — the Mapbox engine, the proxy
  transform, the map ref and six utils — and are reused byte-for-byte under a
  provenance banner. Upstream's five framework-neutral specs run unmodified
  against both upstream's own source and this package's copies, which is what
  backs that reuse claim.

  `mapbox-gl` is an optional peer and is never vendored: from v2 it ships under the
  Mapbox Terms of Service and bills per map load. Upstream's seven component specs
  need a live token and real WebGL under puppeteer, so they are ported against a
  test double, and a differential lane runs six fixtures through the published
  `@vis.gl/react-mapbox@8.1.2` on React with that double so it cannot quietly
  flatter the Octane side: the map shell and its portalled overlays,
  `<Source>`/`<Layer>` add-update-remove, in-place popup option edits alongside
  control add and remove, reaching the map by id from a component outside it to
  fly the camera, `useControl` called straight from a consumer module, and a
  marker choosing between Mapbox's default pin and a custom element.

  Server rendering emits the map container with your `style` merged over the
  binding's defaults and nothing that would need the library, and `hydrateRoot`
  adopts that container rather than replacing it, so the reserved layout box
  survives hydration.

  Four intentional differences, all documented in `UPSTREAM.md` and the README:
  `<Source>` publishes its id through context rather than `cloneElement`, so it
  reaches any descendant `<Layer>`; refs are plain props; effect cleanups — so
  `map.remove()` — run on the drain after `unmount()` rather than inside it; and
  `<Marker>` picks between its own element and Mapbox's default pin from what its
  children rendered, because a compiled children block cannot be inspected the way
  `React.Children.forEach` inspects descriptors. Children that render something,
  render nothing, or first render after mount all match upstream; a child that
  stays truthy while never rendering anything gets the default pin here and an
  empty, invisible element upstream.

- Updated dependencies [10011bb]
- Updated dependencies [081fa1e]
- Updated dependencies [60004f0]
- Updated dependencies [27758f5]
- Updated dependencies [136b0e3]
- Updated dependencies [d69ab86]
- Updated dependencies [1a27e19]
- Updated dependencies [7f6a134]
- Updated dependencies [ce68bb8]
- Updated dependencies [fbe0d39]
- Updated dependencies [9fa0b47]
  - octane@0.1.30
