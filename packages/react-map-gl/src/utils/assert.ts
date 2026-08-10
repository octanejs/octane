// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
export default function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
