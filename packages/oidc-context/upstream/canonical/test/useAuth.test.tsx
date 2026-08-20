import { renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "../src/useAuth";
import { createWrapper } from "./helpers";

const settingsStub = {
    authority: "authority",
    client_id: "client",
    redirect_uri: "redirect",
};

describe("useAuth", () => {
    it("should provide the auth context", async () => {
        // arrange
        const wrapper = createWrapper({ ...settingsStub });
        const { result } = renderHook(() => useAuth(), { wrapper });

        // assert
        await waitFor(() => expect(result.current).toBeDefined());
    });

    it("should return undefined with no provider", async () => {
        const { result } = renderHook(() => useAuth());
        expect(result.current).toBeUndefined();
    });
});
