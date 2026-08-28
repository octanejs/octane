import { useRef, useState, useEffect } from 'preact/hooks';
import autoAnimate from '../index.mjs';

/**
 * AutoAnimate hook for adding dead-simple transitions and animations to preact.
 * @param options - Auto animate options or a plugin
 * @returns
 */
function useAutoAnimate(options) {
    const element = useRef(null);
    const [controller, setController] = useState();
    const setEnabled = (enabled) => {
        if (controller) {
            enabled ? controller.enable() : controller.disable();
        }
    };
    useEffect(() => {
        if (element.current instanceof HTMLElement)
            setController(autoAnimate(element.current, options || {}));
    }, []);
    useEffect(() => {
        return () => {
            var _a;
            (_a = controller === null || controller === void 0 ? void 0 : controller.destroy) === null || _a === void 0 ? void 0 : _a.call(controller);
        };
    }, [controller]);
    return [element, setEnabled];
}

export { useAutoAnimate };
