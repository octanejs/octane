// Vendored from react-hook-form@7.81.0 src/logic/getNodeParentName.ts (octane port).
const ARRAY_INDEX_RE = /\.\d+(\.|$)/;

export default (name: string) => name.substring(0, name.search(ARRAY_INDEX_RE)) || name;
