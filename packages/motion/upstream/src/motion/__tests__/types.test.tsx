import { motion, useMotionValue, ValueTransition } from "framer-motion"
import * as clientMotion from "framer-motion/client"
import { render } from "../../jest.setup"

describe("accepts motion values into both motion components from both entry points", () => {
    it("renders", () => {
        function Component() {
            const valueTransition: ValueTransition = {
                duration: 1,
                ease: "easeInOut",
            }
            const x = useMotionValue(0)
            return (
                <>
                    <motion.div style={{ x }} />
                    <clientMotion.div
                        style={{ x }}
                        transition={valueTransition}
                    />
                </>
            )
        }

        render(<Component />)
    })

    it("accepts expected values", () => {
        function Component() {
            return (
                <motion.div
                    animate={{
                        x: 100,
                        translateX: 100,
                        originX: 0.5,
                        backgroundColor: "red",
                        pathOffset: 0.5,
                        transition: {
                            originX: {},
                            x: {},
                            translateX: {},
                            backgroundColor: {},
                            pathOffset: {},
                        },
                    }}
                    transition={{
                        originX: {},
                        x: {},
                        translateX: {},
                        backgroundColor: {},
                        pathOffset: {},
                    }}
                />
            )
        }

        render(<Component />)
    })
})
