import { describe, expect, it } from "bun:test";

describe("useContainerMeasurement web", () => {
    it("passes in a fresh web measurement process", () => {
        const proc = Bun.spawnSync(["bun", "test", "./__tests__/hooks/useContainerMeasurement.web.cases.ts"], {
            cwd: process.cwd(),
            stderr: "pipe",
            stdout: "pipe",
        });

        expect(proc.exitCode).toBe(0);
    });
});
