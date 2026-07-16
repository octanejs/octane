# Streambox

Streambox is a usable, client-rendered video platform built in TSRX. It is also
the Wave 2 system fixture for native media delivery, persistent DOM-resident
player state, and the real `@octanejs/tanstack-virtual` binding.

## Product journeys

- Open `/watch/:video`, `/watch/:video/comments`, or
  `/watch/:video/transcript` directly and move between the three connected
  panels without replacing the live player.
- Play, pause, seek, mute, finish, enter theater mode, follow a creator, and
  save or like the current video. Like and Save are scoped per video; Follow is
  scoped per creator and persists when returning from another video.
- Browse three local films, search the deterministic catalog, select chapters,
  and jump from timestamped transcript or comment controls.
- Browse 180 dynamically measured comments through a bounded, scrollable
  TanStack Virtual window; sort, search, reach an empty result, and recover.
- Retry an intentional fixture failure, disconnect after media is ready, keep
  the local video playing, queue actions, and reconnect to sync them.
- Complete the player and transcript path with a keyboard at a narrow mobile
  viewport. A skip link, native controls, labels, landmarks, and focus rings
  remain available.

The animated WebM and SVG posters live in `public/`; no browser journey reaches
a network data, font, image, or media service. `scripts/generate-media.mjs`
rebuilds the six-second VP8 fixture through Chromium's native `MediaRecorder`
pipeline when the deterministic media source needs to change.

## Octane evidence

The player UI changes state only in response to browser media events such as
`loadedmetadata`, `play`, `pause`, `seeked`, `volumechange`, `timeupdate`, and
`ended`. Playwright also observes the corresponding `HTMLVideoElement` state;
the tests do not simulate those events.

The persistent-player journey captures the public `<video>` node and a live
playback position, then changes theater layout, catalog search results, and
deep-linked same-video panels. The same node and time remain in place. This is
a deliberate Octane keyed/stable-DOM claim because replacing the player would
lose browser-owned media state. The same journey then proves that like and save
state stays with its video, follow state stays with its creator, and navigating
away and back restores the correct selections without leaking them elsewhere.

Comments use the public `useVirtualizer` adapter with a real scrolling element,
dynamic measurement refs, stable comment keys, and 180 deterministic records.
The browser journey observes that the first record leaves the rendered window
and the final record arrives after a native scroll, then exercises the native
sort select and empty-search recovery.

## Commands

```bash
pnpm --dir examples/streambox typecheck
pnpm --dir examples/streambox build
pnpm --dir examples/streambox dev
pnpm --dir examples/streambox test:e2e
```

The package defaults to port 5223 for manual development. Playwright allocates
an available loopback port and runs the production Vite preview for
`test:e2e`. Set `STREAMBOX_EXAMPLE_BASE_URL` to drive an already-running
deployment.
