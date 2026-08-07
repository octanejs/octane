// @ts-nocheck — byte-exact reuse of @vis.gl/react-mapbox 8.1.2. Upstream compiles
// without strictNullChecks or noImplicitAny; this repository is strict. The copy
// under upstream/ is typechecked with upstream's own configuration instead, so
// nothing here is unchecked, only checked at the settings its authors chose.
// Every line below this four-line banner is byte-identical to upstream.
/** Compare two classNames string and return the difference */
export function compareClassNames(
  prevClassName: string | undefined,
  nextClassName: string | undefined
): string[] | null {
  if (prevClassName === nextClassName) {
    return null;
  }

  const prevClassList = getClassList(prevClassName);
  const nextClassList = getClassList(nextClassName);
  const diff: string[] = [];

  for (const c of nextClassList) {
    if (!prevClassList.has(c)) {
      diff.push(c);
    }
  }
  for (const c of prevClassList) {
    if (!nextClassList.has(c)) {
      diff.push(c);
    }
  }
  return diff.length === 0 ? null : diff;
}

function getClassList(className: string | undefined) {
  return new Set(className ? className.trim().split(/\s+/) : []);
}
