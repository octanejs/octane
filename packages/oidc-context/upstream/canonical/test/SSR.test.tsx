import { renderHook } from "@testing-library/react";
import { useAuth } from "../src/useAuth";
import { createWrapper } from "./helpers";

// force Node environment (no window)
jest.unmock("oidc-client-ts");

describe("In a Node SSR environment", () => {
    it("auth state is initialised", async () => {
        // arrange
        const wrapper = createWrapper({
            authority: "authority",
            client_id: "client",
            redirect_uri: "redirect" });

        const { result } = renderHook(() => useAuth(), {
            wrapper,
        });

        expect(result.current.isLoading).toBeTruthy();
        expect(result.current.isAuthenticated).toBeFalsy();
        expect(result.current.user).toBeUndefined();
    });
});
