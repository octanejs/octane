# Upstream

## Pin

| Field | Value |
| --- | --- |
| Package | `react-waypoint` |
| Version | `6.0.0` |
| Repository | https://github.com/brigade/react-waypoint |
| Commit | `b23770d57fa66b4e20eeb3e8d80fa60d85135f36` |
| Registry integrity | `sha512-Vc3JpyNydJrLUS7Z6tZWn6HWtGmJ6Y1L6U2JkMfI1UAcWxdhksjtuUJE2nn8PhFtIrmeM8tdGPpVZH7o7GWnIg==` |
| License | MIT |

`audit/upstream.lock.json` and `upstream/` preserve the immutable source tree used for this port. `LICENSE` and `LICENSE.upstream` retain the pinned MIT license bytes.

## Source boundary

The position geometry, offset parsing, ancestor selection, callback sequencing, static constants, and public type surface are adapted from the pinned source. The React class component is re-authored as an Octane function component in `src/Waypoint.tsrx`; direct native listeners replace `consolidated-events`, and React prop-type validation is not shipped.

The pinned release contains Jasmine specs, but its legacy suite is not statically countable by the current strict preflight extractor. The graph therefore records no immutable upstream registrations. Repo-authored React/Octane differential, browser, SSR, hydration, runtime, and type evidence covers the public behavior without claiming one-for-one upstream test ownership.
