// SSR/hydration fixture consumed in two compilation modes:
//
//  - client mode by vitest (the octane vite plugin in vitest.config.ts), for
//    the hydrateRoot pass;
//  - server mode by test/_ssr.ts (a vite SSR server with octane({ ssr: true })
//    plus an `octane` → `octane/server` alias), for renderToString.
//
// Both compilations see the same call sites, so hook slots — and therefore the
// hydration markers — line up across the two sides.
import { useStore } from '../../index.ts'

export function AtomTest(props: any) @{
  let value = useStore(props.atomStore, props.atomOpts)
  props.onAtomValue?.(value)
  <div data-testid="atom-test">{value as string}</div>
}

export function MapTest(props: any) @{
  let value = useStore(props.mapStore, props.mapOpts).value
  props.onMapValue?.(value)
  <div data-testid="map-test">{value as string}</div>
}

export function Wrapper(props: any) @{
  <div data-testid="test">
    <AtomTest
      atomStore={props.atomStore}
      atomOpts={props.atomOpts}
      onAtomValue={props.onAtomValue}
    />
    <MapTest
      mapStore={props.mapStore}
      mapOpts={props.mapOpts}
      onMapValue={props.onMapValue}
    />
  </div>
}
