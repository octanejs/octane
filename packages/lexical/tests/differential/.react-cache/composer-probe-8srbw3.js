import { jsx } from "react/jsx-runtime";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
function Probe(props) {
  const ctx = useLexicalComposerContext();
  useEffect(
    () => {
      props.onContext(ctx);
    },
    [ctx]
  );
  return null;
}
function ComposerProbe(props) {
  return /* @__PURE__ */ jsx(LexicalComposer, { initialConfig: props.initialConfig, children: /* @__PURE__ */ jsx(Probe, { onContext: props.onContext }) });
}
export {
  ComposerProbe
};
