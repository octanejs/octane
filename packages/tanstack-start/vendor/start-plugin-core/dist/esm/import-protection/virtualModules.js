import { MOCK_EDGE_PREFIX, MOCK_MODULE_ID, MOCK_RUNTIME_PREFIX } from "./constants.js";
import { relativizePath } from "./utils.js";
import { CLIENT_ENV_SUGGESTIONS } from "./trace.js";
import { isValidExportName } from "./analysis.js";
//#region src/import-protection/virtualModules.ts
function toBase64Url(input) {
	return Buffer.from(input, "utf8").toString("base64url");
}
function fromBase64Url(input) {
	return Buffer.from(input, "base64url").toString("utf8");
}
var RUNTIME_SUGGESTION_TEXT = "Fix: " + CLIENT_ENV_SUGGESTIONS.join(". ") + ". To disable these runtime diagnostics, set importProtection.mockAccess: \"off\".";
function mockRuntimeModuleIdFromViolation(info, mode, root) {
	if (mode === "off") return MOCK_MODULE_ID;
	if (info.env !== "client") return MOCK_MODULE_ID;
	const rel = (p) => relativizePath(p, root);
	const trace = info.trace.map((s) => {
		const file = rel(s.file);
		if (s.line == null) return file;
		return `${file}:${s.line}:${s.column ?? 1}`;
	});
	const payload = {
		env: info.env,
		importer: info.importer,
		specifier: info.specifier,
		trace,
		mode
	};
	return `${MOCK_RUNTIME_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}
function makeMockEdgeModuleId(exports, runtimeId) {
	return `${MOCK_EDGE_PREFIX}${toBase64Url(JSON.stringify({
		exports,
		runtimeId
	}))}`;
}
function generateMockCode(diagnostics) {
	const fnName = diagnostics ? "__createMock" : "createMock";
	const hasDiag = !!diagnostics;
	return `
${hasDiag ? `const __meta = ${JSON.stringify(diagnostics.meta)};
const __mode = ${JSON.stringify(diagnostics.mode)};

const __seen = new Set();
function __report(action, accessPath) {
  if (__mode === 'off') return;
  const key = action + ':' + accessPath;
  if (__seen.has(key)) return;
  __seen.add(key);

  const traceLines = Array.isArray(__meta.trace) && __meta.trace.length
    ? "\\n\\nTrace:\\n" + __meta.trace.map((t, i) => '  ' + (i + 1) + '. ' + String(t)).join('\\n')
    : '';

  const msg =
    '[import-protection] Mocked import used in dev client\\n\\n' +
    'Denied import: "' + __meta.specifier + '"\\n' +
    'Importer: ' + __meta.importer + '\\n' +
    'Access: ' + accessPath + ' (' + action + ')' +
    traceLines +
    '\\n\\n' + ${JSON.stringify(RUNTIME_SUGGESTION_TEXT)};

  const err = new Error(msg);
  if (__mode === 'warn') {
    console.warn(err);
  } else {
    console.error(err);
  }
}
` : ""}/* @__NO_SIDE_EFFECTS__ */
function ${fnName}(name) {
  const fn = function () {};
  fn.prototype.name = name;
  const children = Object.create(null);
  const proxy = new Proxy(fn, {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (prop === 'caller') return null;
      if (prop === 'then') return (f) => Promise.resolve(f(proxy));
      if (prop === 'catch') return () => Promise.resolve(proxy);
      if (prop === 'finally') return (f) => { f(); return Promise.resolve(proxy); };${`
      if (prop === Symbol.toPrimitive) {
        return () => {
          ${hasDiag ? `__report('toPrimitive', name);` : ""}
          return '[import-protection mock]';
        };
      }
      if (prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
        return () => {
          ${hasDiag ? `__report(String(prop), name);` : ""}
          return '[import-protection mock]';
        };
      }`}
      if (typeof prop === 'symbol') return undefined;
      if (!(prop in children)) {
        children[prop] = ${fnName}(name + '.' + prop);
      }
      return children[prop];
    },
    apply() {
      ${hasDiag ? `__report('call', name + '()');
      return ${fnName}(name + '()');` : `return ${fnName}(name + '()');`}
    },
    construct() {
      ${hasDiag ? `__report('construct', 'new ' + name);
      return ${fnName}('new ' + name);` : `return ${fnName}('new ' + name);`}
    },${hasDiag ? `
    set(_target, prop) {
      __report('set', name + '.' + String(prop));
      return true;
    },` : ""}
  });
  return proxy;
}
const mock = /* @__PURE__ */ ${fnName}('mock');
export default mock;
`;
}
function loadSilentMockModule() {
	return { code: generateMockCode() };
}
function filterExportNames(exports) {
	return exports.filter((n) => n.length > 0 && n !== "default");
}
function generateExportLines(names) {
	const lines = [];
	const stringExports = [];
	for (let i = 0; i < names.length; i++) {
		const n = names[i];
		if (isValidExportName(n)) lines.push(`export const ${n} = mock.${n};`);
		else {
			const alias = `__tss_str_${i}`;
			lines.push(`const ${alias} = mock[${JSON.stringify(n)}];`);
			stringExports.push({
				alias,
				name: n
			});
		}
	}
	if (stringExports.length > 0) {
		const reexports = stringExports.map((s) => `${s.alias} as ${JSON.stringify(s.name)}`).join(", ");
		lines.push(`export { ${reexports} };`);
	}
	return lines;
}
function generateSelfContainedMockModule(exportNames) {
	return { code: `${generateMockCode()}
${generateExportLines(filterExportNames(exportNames)).join("\n")}
` };
}
function generateDevSelfDenialModule(exportNames, runtimeId) {
	const exportLines = generateExportLines(filterExportNames(exportNames));
	return { code: `import mock from ${JSON.stringify(runtimeId)};
${exportLines.join("\n")}
export default mock;
` };
}
function loadMockEdgeModule(encodedPayload) {
	let payload;
	try {
		payload = JSON.parse(fromBase64Url(encodedPayload));
	} catch {
		payload = { exports: [] };
	}
	const names = filterExportNames(payload.exports ?? []);
	const runtimeId = typeof payload.runtimeId === "string" && payload.runtimeId.length > 0 ? payload.runtimeId : MOCK_MODULE_ID;
	const exportLines = generateExportLines(names);
	return { code: `import mock from ${JSON.stringify(runtimeId)};
${exportLines.join("\n")}
export default mock;
` };
}
function loadMockRuntimeModule(encodedPayload) {
	let payload;
	try {
		payload = JSON.parse(fromBase64Url(encodedPayload));
	} catch {
		payload = {};
	}
	const mode = payload.mode === "warn" || payload.mode === "off" ? payload.mode : "error";
	return { code: generateMockCode({
		meta: {
			env: String(payload.env ?? ""),
			importer: String(payload.importer ?? ""),
			specifier: String(payload.specifier ?? ""),
			trace: Array.isArray(payload.trace) ? payload.trace : []
		},
		mode
	}) };
}
var MARKER_MODULE_RESULT = { code: "export {}" };
function loadMarkerModule() {
	return MARKER_MODULE_RESULT;
}
//#endregion
export { RUNTIME_SUGGESTION_TEXT, generateDevSelfDenialModule, generateSelfContainedMockModule, loadMarkerModule, loadMockEdgeModule, loadMockRuntimeModule, loadSilentMockModule, makeMockEdgeModuleId, mockRuntimeModuleIdFromViolation };

//# sourceMappingURL=virtualModules.js.map