/** @jsxImportSource octane */
// Adapted one-for-one from packages/popper/upstream/tag/typings/tests/main-test.tsx
// Please remember to update also the Flow test files that can
// be found under `/src/__typings__` please. Thanks! 🤗

import { useState } from 'octane';
import { Manager, Reference, Popper, usePopper } from '@octanejs/popper';

export const Test = () => (
  <Manager>
    <Reference>{({ ref }) => <div ref={ref} />}</Reference>
    <Popper
      placement="top"
      strategy="fixed"
      modifiers={[{ name: 'flip', enabled: false }]}
    >
      {({
        ref,
        style,
        placement,
        isReferenceHidden,
        hasPopperEscaped,
        update,
        arrowProps,
      }) => (
        <div
          ref={ref}
          style={{
            ...style,
            opacity: isReferenceHidden || hasPopperEscaped ? 0 : 1,
          }}
          data-placement={placement}
          onClick={() => update()}
        >
          Popper
          <div ref={arrowProps.ref} style={arrowProps.style} />
        </div>
      )}
    </Popper>
    <Popper>
      {({ ref, style, placement }) => (
        <div ref={ref} style={style} data-placement={placement}>
          Popper
        </div>
      )}
    </Popper>
  </Manager>
);

const HookTest = () => {
  const [
    referenceElement,
    setReferenceElement,
  ] = useState<Element | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(
    null
  );
  const [arrowElement, setArrowElement] = useState<HTMLElement | null>(
    null
  );
  const { styles, attributes, update } = usePopper(
    referenceElement,
    popperElement,
    {
      modifiers: [{ name: 'arrow', options: { element: arrowElement } }],
    }
  );

  return (
    <>
      <button
        type="button"
        ref={setReferenceElement}
        onClick={() => {
          update && update();
        }}
      >
        Reference element
      </button>

      <div ref={setPopperElement} style={styles.popper} {...attributes.popper}>
        Popper element
        <div ref={setArrowElement} style={styles.arrow} />
      </div>
    </>
  );
};
