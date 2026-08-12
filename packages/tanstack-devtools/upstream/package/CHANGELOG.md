# @tanstack/react-devtools

## 0.10.7

### Patch Changes

- Updated dependencies [[`cc8c81b`](https://github.com/TanStack/devtools/commit/cc8c81b9e2e26596dc27a87bba6954b3821145a7)]:
  - @tanstack/devtools@0.12.4

## 0.10.6

### Patch Changes

- [#466](https://github.com/TanStack/devtools/pull/466) [`73983a7`](https://github.com/TanStack/devtools/commit/73983a7d7e8eaa8800322f476130df3ed4329685) - Fix the plugin marketplace rendering empty ("No additional plugins available")
  when it should list installable plugins.
  - The client event bus no longer silently drops events emitted while its
    WebSocket is still connecting. Such events are now queued and flushed once
    the socket opens, so the marketplace's `mounted` request reliably reaches the
    server bus.
  - The marketplace now re-requests `package.json` every time it is opened and
    retries until the data arrives, so re-opening always re-fetches the plugin
    list.
  - Added TanStack AI Devtools (`@tanstack/react-ai-devtools`) to the plugin
    marketplace registry.

- Updated dependencies [[`73983a7`](https://github.com/TanStack/devtools/commit/73983a7d7e8eaa8800322f476130df3ed4329685)]:
  - @tanstack/devtools@0.12.3

## 0.10.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.12.2

## 0.10.4

### Patch Changes

- Updated dependencies [[`5ac65f8`](https://github.com/TanStack/devtools/commit/5ac65f80592c00c5d11605d86cef0576ea35db75)]:
  - @tanstack/devtools@0.12.1

## 0.10.3

### Patch Changes

- Updated dependencies [[`58e66f5`](https://github.com/TanStack/devtools/commit/58e66f5a2680537d0552d75c7e17d6ded62446f3)]:
  - @tanstack/devtools@0.12.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`aa32769`](https://github.com/TanStack/devtools/commit/aa32769932b2443a91f123f3213d687f35810d4b)]:
  - @tanstack/devtools@0.11.2

## 0.10.1

### Patch Changes

- Updated dependencies [[`e89cff4`](https://github.com/TanStack/devtools/commit/e89cff4b4e5953d66bac76567161dc7314d13850), [`e04bb11`](https://github.com/TanStack/devtools/commit/e04bb11becc87c1014d78fdda57eb810cdd16adf)]:
  - @tanstack/devtools@0.11.1

## 0.10.0

### Minor Changes

- Change the way props are passed to the plugins ([#319](https://github.com/TanStack/devtools/pull/319))

### Patch Changes

- Updated dependencies [[`7c33985`](https://github.com/TanStack/devtools/commit/7c339855988d03896cb42d00eeb555750a3a1aff), [`40db560`](https://github.com/TanStack/devtools/commit/40db560c00a3c5da9d5f98e138e8f59a2619f6ff)]:
  - @tanstack/devtools@0.11.0

## 0.9.13

### Patch Changes

- Updated dependencies [[`1451124`](https://github.com/TanStack/devtools/commit/1451124c079c0bd0fecf7bdf47b87a67f3780b23)]:
  - @tanstack/devtools@0.10.14

## 0.9.12

### Patch Changes

- Updated dependencies [[`644bcb3`](https://github.com/TanStack/devtools/commit/644bcb3ec5faa374f37882282eb01a37611ed0e2)]:
  - @tanstack/devtools@0.10.13

## 0.9.11

### Patch Changes

- Updated dependencies [[`0dfc04a`](https://github.com/TanStack/devtools/commit/0dfc04ab7ed3c770f7fbf7c7cb8f636403e1cf91)]:
  - @tanstack/devtools@0.10.12

## 0.9.10

### Patch Changes

- Updated dependencies [[`024ea7d`](https://github.com/TanStack/devtools/commit/024ea7d602728081fe465588fb5e10603b71ad72)]:
  - @tanstack/devtools@0.10.11

## 0.9.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.10.10

## 0.9.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.10.9

## 0.9.7

### Patch Changes

- Updated dependencies [[`d05a9af`](https://github.com/TanStack/devtools/commit/d05a9afb590503b464c584fd7f8314c50eb88339)]:
  - @tanstack/devtools@0.10.8

## 0.9.6

### Patch Changes

- Updated dependencies [[`cdb6c77`](https://github.com/TanStack/devtools/commit/cdb6c77b4d2156d2f6dbfce493f1a3f010109c13)]:
  - @tanstack/devtools@0.10.7

## 0.9.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.10.6

## 0.9.4

### Patch Changes

- Updated dependencies [[`9f45788`](https://github.com/TanStack/devtools/commit/9f45788b4504bac69b4bd1ab64039a2410a350f1)]:
  - @tanstack/devtools@0.10.5

## 0.9.3

### Patch Changes

- Updated dependencies [[`a9e05c0`](https://github.com/TanStack/devtools/commit/a9e05c00c9d351eaa0ba89d54716dfa7a297b8af)]:
  - @tanstack/devtools@0.10.4

## 0.9.2

### Patch Changes

- Updated dependencies [[`e9f700c`](https://github.com/TanStack/devtools/commit/e9f700ce7d3327463a7c03ee8bdb1401452b18b1)]:
  - @tanstack/devtools@0.10.3

## 0.9.1

### Patch Changes

- Updated dependencies [[`adcf45c`](https://github.com/TanStack/devtools/commit/adcf45c434a0fa3d8f3d5d986606c2593a30a671)]:
  - @tanstack/devtools@0.10.2

## 0.9.0

### Minor Changes

- fix issues with apps dying if the server port is not available for the event bus ([#297](https://github.com/TanStack/devtools/pull/297))

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.10.1

## 0.8.6

### Patch Changes

- Updated dependencies [[`b1de50b`](https://github.com/TanStack/devtools/commit/b1de50b7817c83f51aebfb870107461b51d03dd9)]:
  - @tanstack/devtools@0.10.0

## 0.8.5

### Patch Changes

- Updated dependencies [[`28a3f56`](https://github.com/TanStack/devtools/commit/28a3f56a19a08153feb991c2362847c033e00f66)]:
  - @tanstack/devtools@0.9.2

## 0.8.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.9.1

## 0.8.3

### Patch Changes

- Updated dependencies [[`6d3bdc0`](https://github.com/TanStack/devtools/commit/6d3bdc045637503e7ddfe5253ad5f2dbaa27f593)]:
  - @tanstack/devtools@0.9.0

## 0.8.2

### Patch Changes

- Updated dependencies [[`d781f4f`](https://github.com/TanStack/devtools/commit/d781f4f7588619bd042ba647a6cfa139b1430f46)]:
  - @tanstack/devtools@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies [[`096744e`](https://github.com/TanStack/devtools/commit/096744e918a8c76d656f3abb1728ad7390fe8b4b)]:
  - @tanstack/devtools@0.8.1

## 0.8.0

### Minor Changes

- added optional trigger component in config ([#228](https://github.com/TanStack/devtools/pull/228))

  removed trigger image setting completely

### Patch Changes

- Updated dependencies [[`f02a894`](https://github.com/TanStack/devtools/commit/f02a8941e7f0f0cfe44ffb370391267261f31f4e), [`d524864`](https://github.com/TanStack/devtools/commit/d524864ce64f3fa0409f9f05e212b3ad07c661ee)]:
  - @tanstack/devtools@0.8.0

## 0.7.11

### Patch Changes

- Updated dependencies [[`aa32c02`](https://github.com/TanStack/devtools/commit/aa32c0219a90abf350bd287f2ef0321b3a5012e8)]:
  - @tanstack/devtools@0.7.0

## 0.7.10

### Patch Changes

- Updated dependencies [[`93ec7e9`](https://github.com/TanStack/devtools/commit/93ec7e91854d8e39e3f148f8d1ab966f464d2706)]:
  - @tanstack/devtools@0.6.24

## 0.7.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.23

## 0.7.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.22

## 0.7.7

### Patch Changes

- Added plugin marketplace functionality into devtools ([#216](https://github.com/TanStack/devtools/pull/216))

- Updated dependencies [[`0b4a4a9`](https://github.com/TanStack/devtools/commit/0b4a4a9e57f3be7079166198f3e69fedd15c5b5d)]:
  - @tanstack/devtools@0.6.21

## 0.7.6

### Patch Changes

- Updated dependencies [[`b2f8944`](https://github.com/TanStack/devtools/commit/b2f8944ebf3597179d60ce11fb0ef71b4858dc34)]:
  - @tanstack/devtools@0.6.20

## 0.7.5

### Patch Changes

- Updated dependencies [[`5362ab5`](https://github.com/TanStack/devtools/commit/5362ab51b8cb539b15d91435d106fb09703f388f)]:
  - @tanstack/devtools@0.6.19

## 0.7.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.18

## 0.7.3

### Patch Changes

- Updated dependencies [[`748d2e9`](https://github.com/TanStack/devtools/commit/748d2e9cdbbc079442bab7bf6da85ed2767a833d)]:
  - @tanstack/devtools@0.6.17

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.16

## 0.7.1

### Patch Changes

- Updated dependencies [[`a97ed26`](https://github.com/TanStack/devtools/commit/a97ed2685b43c25d34e5e30cc5f07254b3e810bf)]:
  - @tanstack/devtools@0.6.15

## 0.7.0

### Minor Changes

- remove the production subexport in favor of always exporting the exports ([#150](https://github.com/TanStack/devtools/pull/150))

## 0.6.10

### Patch Changes

- Updated dependencies [[`6b6aa45`](https://github.com/TanStack/devtools/commit/6b6aa45e10ba08cc9465d3c73c9b1454a9966170)]:
  - @tanstack/devtools@0.6.14

## 0.6.9

### Patch Changes

- Updated dependencies [[`a18b77e`](https://github.com/TanStack/devtools/commit/a18b77e1017e814cc0393d2e4f44acd80abf99a6)]:
  - @tanstack/devtools@0.6.13

## 0.6.8

### Patch Changes

- Updated dependencies [[`c463e10`](https://github.com/TanStack/devtools/commit/c463e1083771b8fce2ea30aa999aa36ea4040f7f)]:
  - @tanstack/devtools@0.6.12

## 0.6.7

### Patch Changes

- Adds split panel functionality to the devtools panel, allowing multiple instances of devtools to be shown. ([#90](https://github.com/TanStack/devtools/pull/90))

- Updated dependencies [[`c591da3`](https://github.com/TanStack/devtools/commit/c591da3a6e258d943f4c0d1b5b3f5cdd1111f37c)]:
  - @tanstack/devtools@0.6.11

## 0.6.6

### Patch Changes

- Updated dependencies [[`784313b`](https://github.com/TanStack/devtools/commit/784313b8953184dcd65c008b0efabc2f5a532b27)]:
  - @tanstack/devtools@0.6.10

## 0.6.5

### Patch Changes

- Updated dependencies [[`42d883d`](https://github.com/TanStack/devtools/commit/42d883dff07e622c4f1c16e9559bf00fcdd27572)]:
  - @tanstack/devtools@0.6.9

## 0.6.4

### Patch Changes

- Updated dependencies [[`6447ab2`](https://github.com/TanStack/devtools/commit/6447ab20d6f479b9a71be2c727d70a441d09222b)]:
  - @tanstack/devtools@0.6.8

## 0.6.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.7

## 0.6.2

### Patch Changes

- Updated dependencies [[`2fe02f9`](https://github.com/TanStack/devtools/commit/2fe02f906e6e9118c87efbb95508c8f030abfd5d), [`2fe02f9`](https://github.com/TanStack/devtools/commit/2fe02f906e6e9118c87efbb95508c8f030abfd5d)]:
  - @tanstack/devtools@0.6.6

## 0.6.1

### Patch Changes

- Updated dependencies [[`4119f73`](https://github.com/TanStack/devtools/commit/4119f73caa27dcaae1fe7cbca20a11f18b4d99b8)]:
  - @tanstack/devtools@0.6.5

## 0.6.0

### Minor Changes

- added support for dark/light mode ([#96](https://github.com/TanStack/devtools/pull/96))

### Patch Changes

- Updated dependencies [[`59ecdb6`](https://github.com/TanStack/devtools/commit/59ecdb663cb9410fabf507df684d767c1d4edf11)]:
  - @tanstack/devtools@0.6.4

## 0.5.5

### Patch Changes

- Updated dependencies [[`442d2ce`](https://github.com/TanStack/devtools/commit/442d2ce1883b4517398e2890f4180b622765148d)]:
  - @tanstack/devtools@0.6.3

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.6.2

## 0.5.3

### Patch Changes

- Updated dependencies [[`fc02e84`](https://github.com/TanStack/devtools/commit/fc02e849dd4a00e2e96d867d4c78dabac9989610)]:
  - @tanstack/devtools@0.6.1

## 0.5.2

### Patch Changes

- Updated dependencies [[`a7c95fa`](https://github.com/TanStack/devtools/commit/a7c95fab9bea2371f77a0c47fc4d0dc2908a6c37)]:
  - @tanstack/devtools@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`544d7af`](https://github.com/TanStack/devtools/commit/544d7af30b163b52923dc678602645bb098b3009)]:
  - @tanstack/devtools@0.5.1

## 0.5.0

### Minor Changes

- removed CJS support, added detached mode to devtools ([#70](https://github.com/TanStack/devtools/pull/70))

### Patch Changes

- Updated dependencies [[`9feb9c3`](https://github.com/TanStack/devtools/commit/9feb9c33517bda2e515b00d423bedab2502c9981)]:
  - @tanstack/devtools@0.5.0

## 0.4.6

### Patch Changes

- Updated dependencies [[`206252b`](https://github.com/TanStack/devtools/commit/206252ba47ba8f9ad173bc7a2088bb96bfff0334)]:
  - @tanstack/devtools@0.4.5

## 0.4.5

### Patch Changes

- Updated dependencies [[`2efe23f`](https://github.com/TanStack/devtools/commit/2efe23f05f4b2be651de03d29f474be6ebfb0dc7)]:
  - @tanstack/devtools@0.4.4

## 0.4.4

### Patch Changes

- Updated dependencies [[`1ff5f18`](https://github.com/TanStack/devtools/commit/1ff5f18a49afb190b1457c938faeee71b078ddb6)]:
  - @tanstack/devtools@0.4.3

## 0.4.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.4.2

## 0.4.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.4.1

## 0.4.1

### Patch Changes

- exclude from production by default ([#45](https://github.com/TanStack/devtools/pull/45))

## 0.4.0

### Minor Changes

- Change the TanStackDevtools export ([#40](https://github.com/TanStack/devtools/pull/40))

### Patch Changes

- Updated dependencies [[`94731d3`](https://github.com/TanStack/devtools/commit/94731d397436d10d43d874f3aff5bf549db32e06)]:
  - @tanstack/devtools@0.4.0

## 0.3.1

### Patch Changes

- fix the height of the mounted container ([#38](https://github.com/TanStack/devtools/pull/38))

- Updated dependencies [[`4bbb4b8`](https://github.com/TanStack/devtools/commit/4bbb4b8715b89f7ad84fb137fdeebdf5a02569a3)]:
  - @tanstack/devtools@0.3.2

## 0.3.0

### Minor Changes

- Added json tree to devtools-ui and adjusted the width for the plugin renderers ([#29](https://github.com/TanStack/devtools/pull/29))

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.3.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`f9b97df`](https://github.com/TanStack/devtools/commit/f9b97dfbfdb3b6eccf51cba2655b8bd542f21bfa)]:
  - @tanstack/devtools@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/devtools@0.2.1

## 0.2.0

### Minor Changes

- Added event bus functionality into @tanstack/devtools ([#11](https://github.com/TanStack/devtools/pull/11))
  - @tanstack/devtools now comes with an integrated Event Bus on the Client.
  - The Event Bus allows for seamless communication between different parts of your running application
    without tight coupling.
  - Exposed APIs for publishing and subscribing to events.
  - Added config for the client event bus

### Patch Changes

- Updated dependencies [[`77e2f6e`](https://github.com/TanStack/devtools/commit/77e2f6e8d3d5cc82b8d37fcc00c01078e9960003)]:
  - @tanstack/devtools@0.2.0

## 0.1.1

### Patch Changes

- Updated the JSdoc descriptions for easier usage ([#8](https://github.com/TanStack/devtools/pull/8))

- Updated dependencies [[`d7dc082`](https://github.com/TanStack/devtools/commit/d7dc08211dcaba9d226ad1963e812430530e6d35)]:
  - @tanstack/devtools@0.1.1

## 0.1.0

### Minor Changes

- Initial alpha release of @tanstack/devtools ([#6](https://github.com/TanStack/devtools/pull/6))

### Patch Changes

- Updated dependencies [[`d579c1b`](https://github.com/TanStack/devtools/commit/d579c1b01cdf9a9eac9bccb55e8e5ba7f6839485)]:
  - @tanstack/devtools@0.1.0
