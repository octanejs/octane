# @octanejs/visx

## 0.1.44

### Patch Changes

- Updated dependencies [157543f]
- Updated dependencies [4d13159]
- Updated dependencies [a944ff3]
- Updated dependencies [f9f0d23]
- Updated dependencies [edf2b9d]
- Updated dependencies [9779569]
- Updated dependencies [96c86fc]
  - octane@0.1.50
  - @octanejs/floating-ui@0.1.49

## 0.1.43

### Patch Changes

- Updated dependencies [8adc693]
- Updated dependencies [3bcc1d3]
- Updated dependencies [a51c8c6]
  - octane@0.1.49
  - @octanejs/floating-ui@0.1.48

## 0.1.42

### Patch Changes

- Updated dependencies [3ca30fc]
- Updated dependencies [efdc8cb]
- Updated dependencies [922df8c]
- Updated dependencies [8a8afd8]
- Updated dependencies [cfa753b]
- Updated dependencies [37a8ca1]
- Updated dependencies [c84edbb]
- Updated dependencies [d5175ca]
- Updated dependencies [4a4996e]
  - octane@0.1.48
  - @octanejs/floating-ui@0.1.47

## 0.1.41

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
  - @octanejs/floating-ui@0.1.46

## 0.1.40

### Patch Changes

- Updated dependencies [7e96f71]
- Updated dependencies [d7226ff]
  - octane@0.1.46
  - @octanejs/floating-ui@0.1.45

## 0.1.39

### Patch Changes

- 6927595: Fix strict browser TypeScript consumption of source-published chart bindings.

  Recharts now publishes authored TypeScript for its chart utilities and state,
  resolves component imports explicitly, and exports the component implementations'
  own prop types. Visx supports strict browser source checks without Node globals.
  Remix Router's published declarations retain native anchor and form ref types.
  Redux Toolkit's query hooks type their bundler environment without Node globals.

  Fix deferred native chart events, keep imperative and Cell refs off unrelated
  hosts, and resolve missing radial geometry without dropping data rows.

  Octane accepts optional refs in composed ref arrays and supports nested ref arrays
  in `useImperativeHandle`, including callback cleanup and primitive handles. Require
  the published TSRX compiler fix for ref-and-spread expressions rather than relying
  on a workspace-only patch.

  Publish the Volar compiler with its tested parser/printer dependencies and checked
  public declarations, preventing newer transitive printers from corrupting typed
  tuple parameters in installed consumers. Preserve generic Pie props and the
  native group targets of polar-axis events.

- Updated dependencies [5b1e6a3]
- Updated dependencies [31abee5]
- Updated dependencies [fd6ce69]
- Updated dependencies [5f7a457]
- Updated dependencies [5227d7b]
- Updated dependencies [6927595]
- Updated dependencies [f1a7802]
  - octane@0.1.45
  - @octanejs/floating-ui@0.1.44

## 0.1.38

### Patch Changes

- 3004ba5: Type published visx source against Octane attribute bags and native DOM events so a consumer `tsrx-tsc` check drops from 90 diagnostics to the leftover #737 spread+ref sites.
- Updated dependencies [9b06e47]
- Updated dependencies [7535acd]
  - octane@0.1.44
  - @octanejs/floating-ui@0.1.43

## 0.1.37

### Patch Changes

- Updated dependencies [4b590bd]
- Updated dependencies [c0ff085]
- Updated dependencies [6a68a7d]
- Updated dependencies [6b97f85]
  - octane@0.1.43
  - @octanejs/floating-ui@0.1.42

## 0.1.36

### Patch Changes

- Updated dependencies [1581e1b]
- Updated dependencies [afa3722]
- Updated dependencies [231e248]
- Updated dependencies [2f9b301]
- Updated dependencies [939c64d]
  - octane@0.1.42
  - @octanejs/floating-ui@0.1.41

## 0.1.35

### Patch Changes

- Updated dependencies [489a886]
- Updated dependencies [922b2d4]
- Updated dependencies [814a3c1]
  - octane@0.1.41
  - @octanejs/floating-ui@0.1.40

## 0.1.34

### Patch Changes

- Updated dependencies [ff9b859]
- Updated dependencies [14b8b40]
- Updated dependencies [cc6e5ea]
  - octane@0.1.40
  - @octanejs/floating-ui@0.1.39

## 0.1.33

### Patch Changes

- Updated dependencies [954028b]
- Updated dependencies [21f4dfb]
- Updated dependencies [1cb4a19]
- Updated dependencies [0fc84da]
  - octane@0.1.39
  - @octanejs/floating-ui@0.1.38

## 0.1.32

### Patch Changes

- 7a39ed5: Type visx's SVG props with octane's attribute bag instead of React's.

  This package ships raw source and points its exports at it, so a consumer's
  TypeScript program compiles every reachable module. React's `SVGProps` is not
  assignable to octane's intrinsic element bag — handlers receive native DOM
  events, `className` composes clsx-style, `class`/`for` are accepted natively,
  and `children` is a renderable — so every component that spread it produced
  errors in a consumer's program.

  Forty-two modules move from React's `SVGProps` to `Octane.SVGProps`, following
  the pattern already established in `grid/`, `group/`, `responsive/`, and
  `shape/`. Alongside that: capitalized JSX aliases replace `createElement` where
  a React `FunctionComponent | ComponentClass` union reached octane's
  `createElement`, which takes a `ComponentBody` and cannot call a constructor; a
  real declaration for `d3-interpolate-path`; and a render-prop implementation of
  `TooltipPositionContext.Consumer`, which octane deliberately lacks.

  Public prop types change accordingly. Handler parameters are now native DOM
  events rather than React synthetic events, `className` accepts a `ClassValue`,
  and the native `class`, `for`, `hidden`, and `tabindex` spellings are accepted
  beside their camelCase counterparts. Component names, prop names, and runtime
  behavior are unchanged.

  This is partial progress on strict consumer type-checking for visx, not its
  completion: the package still reports diagnostics under `tsrx-tsc`, so it keeps
  its `SOURCE_PUBLICATION_DEBT` entry and continues to validate through `tsgo`.

- Updated dependencies [0635af6]
  - octane@0.1.38
  - @octanejs/floating-ui@0.1.37

## 0.1.31

### Patch Changes

- Updated dependencies [954c75f]
- Updated dependencies [94fa199]
- Updated dependencies [c2e77a3]
- Updated dependencies [125c861]
- Updated dependencies [765134a]
- Updated dependencies [9efd6f4]
- Updated dependencies [603756a]
  - octane@0.1.37
  - @octanejs/floating-ui@0.1.36

## 0.1.30

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
  - @octanejs/floating-ui@0.1.35

## 0.1.29

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
  - @octanejs/floating-ui@0.1.34

## 0.1.28

### Patch Changes

- Updated dependencies [78316b4]
- Updated dependencies [4e53ef4]
- Updated dependencies [4cc7840]
- Updated dependencies [39b3e19]
- Updated dependencies [8c29020]
- Updated dependencies [97e65b9]
  - octane@0.1.34
  - @octanejs/floating-ui@0.1.33

## 0.1.27

### Patch Changes

- Updated dependencies [1fe297e]
- Updated dependencies [db0d495]
- Updated dependencies [677182d]
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
  - @octanejs/floating-ui@0.1.32

## 0.1.26

### Patch Changes

- Updated dependencies [d453832]
- Updated dependencies [3152f0b]
- Updated dependencies [1c44117]
- Updated dependencies [cbd55ca]
- Updated dependencies [cdb501c]
  - octane@0.1.32
  - @octanejs/floating-ui@0.1.31

## 0.1.25

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31
  - @octanejs/floating-ui@0.1.30

## 0.1.24

### Patch Changes

- Updated dependencies [121ab45]
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
  - @octanejs/floating-ui@0.1.29
  - octane@0.1.30

## 0.1.23

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29
  - @octanejs/floating-ui@0.1.28

## 0.1.22

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28
  - @octanejs/floating-ui@0.1.27

## 0.1.21

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27
  - @octanejs/floating-ui@0.1.26

## 0.1.20

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26
  - @octanejs/floating-ui@0.1.25

## 0.1.19

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - @octanejs/floating-ui@0.1.24
  - octane@0.1.25

## 0.1.18

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24
  - @octanejs/floating-ui@0.1.23

## 0.1.17

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23
  - @octanejs/floating-ui@0.1.22

## 0.1.16

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/floating-ui@0.1.21

## 0.1.15

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/floating-ui@0.1.20

## 0.1.14

### Patch Changes

- Updated dependencies [c6370b6]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20
  - @octanejs/floating-ui@0.1.19

## 0.1.13

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/floating-ui@0.1.18

## 0.1.12

### Patch Changes

- Updated dependencies [c3ba5e0]
- Updated dependencies [430061e]
- Updated dependencies [a21ff46]
- Updated dependencies [1821f63]
- Updated dependencies [3db74e9]
- Updated dependencies [0d4ed9e]
- Updated dependencies [7bdf1fa]
- Updated dependencies [e1927d8]
- Updated dependencies [dac0e66]
- Updated dependencies [54c60fa]
- Updated dependencies [59a95d6]
- Updated dependencies [138fbd9]
- Updated dependencies [50c1ab5]
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
  - @octanejs/floating-ui@0.1.17

## 0.1.11

### Patch Changes

- Updated dependencies [bd31a2d]
- Updated dependencies [9e0ef45]
- Updated dependencies [dea219b]
- Updated dependencies [2374980]
- Updated dependencies [2374980]
- Updated dependencies [ac687f8]
- Updated dependencies [7997d39]
- Updated dependencies [eb69cb6]
  - octane@0.1.17
  - @octanejs/floating-ui@0.1.16

## 0.1.10

### Patch Changes

- Updated dependencies [85a1c6d]
- Updated dependencies [f4c97d8]
- Updated dependencies [f3543bf]
- Updated dependencies [dfa6d29]
- Updated dependencies [9fbf31a]
  - octane@0.1.16
  - @octanejs/floating-ui@0.1.15

## 0.1.9

### Patch Changes

- Updated dependencies [16dc385]
- Updated dependencies [7fa4075]
  - octane@0.1.15
  - @octanejs/floating-ui@0.1.14

## 0.1.8

### Patch Changes

- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [3ea0855]
- Updated dependencies [08843da]
- Updated dependencies [8e01289]
- Updated dependencies [cc79ac5]
- Updated dependencies [3ea0855]
- Updated dependencies [f96e7c4]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [cc79ac5]
- Updated dependencies [971ec0c]
- Updated dependencies [971ec0c]
- Updated dependencies [1145d98]
- Updated dependencies [e19989d]
- Updated dependencies [f96e7c4]
- Updated dependencies [07dff41]
- Updated dependencies [cc79ac5]
- Updated dependencies [3686e54]
  - octane@0.1.14
  - @octanejs/floating-ui@0.1.13

## 0.1.7

### Patch Changes

- 3ffce4c: Update the TSRX compiler adapters and Ripple integration to their synchronized
  latest releases, including the nested-JSX slash parsing fix and Solid 2 beta.15
  alignment. Refresh the supported dependency ranges shipped by the affected
  framework bindings and build integrations.
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
  - @octanejs/floating-ui@0.1.12

## 0.1.6

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
  - @octanejs/floating-ui@0.1.11

## 0.1.5

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
  - @octanejs/floating-ui@0.1.10

## 0.1.4

### Patch Changes

- Updated dependencies [d426046]
- Updated dependencies [f511024]
  - octane@0.1.10
  - @octanejs/floating-ui@0.1.9

## 0.1.3

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
  - @octanejs/floating-ui@0.1.8

## 0.1.2

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
  - @octanejs/floating-ui@0.1.7

## 0.1.1

### Patch Changes

- 6ea9f82: Add the complete current Airbnb Visx 4.x web surface as 49 public entry points, with TSRX components and hooks, native interactions, deterministic server rendering, and hydration adoption.
- Updated dependencies [eaacd17]
- Updated dependencies [93dcb81]
- Updated dependencies [6852df7]
- Updated dependencies [b00cd74]
- Updated dependencies [e9852d4]
  - octane@0.1.7
  - @octanejs/floating-ui@0.1.6
