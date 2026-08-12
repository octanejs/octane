// Test-side ambient Window surface for the swr devtools contract. The runtime
// installs __SWR_DEVTOOLS_OCTANE__ with Object.defineProperty
// (src/_internal/devtools-contract.ts), so no importable declaration exists.
// Kept under tests/ so the published tarball (package.json "files": ["src", …])
// never ships an ambient Window augmentation to consumers.
interface Window {
	__SWR_DEVTOOLS_OCTANE__?: unknown;
	__SWR_DEVTOOLS_REACT__?: unknown;
}
