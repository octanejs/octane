import React, { Component } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom"; // extend expect() with toBeInTheDocument

import { AuthProvider, withAuth } from "../src";

const settingsStub = { authority: "authority", client_id: "client", redirect_uri: "redirect" };

describe("withAuth", () => {
    it("should wrap a class component, adding AuthContextProps to the component's `auth` prop", async () => {
        // arrange
        class MyComponent extends Component {
            render(): React.JSX.Element {
                for (const [k, v] of Object.entries(this.props)) {
                    if (k === "auth") {
                        return <>{k}: {Object.keys(v as Map<string, unknown>)}</>;
                    }
                }
                return <></>;
            }
        }

        // act
        const WrappedComponent = withAuth(MyComponent);
        render(
            <AuthProvider {...settingsStub}>
                <WrappedComponent />
            </AuthProvider>,
        );
        expect(await screen.findByText(/auth/)).toBeInTheDocument();
        expect(await screen.findByText(/signinRedirect/)).toBeInTheDocument();
    });

    it("should pass through wrapped component props", async () => {
        // arrange
        class MyPropsComponent extends Component<{ originalProp: string }> {
            render(): React.JSX.Element {
                return <>originalPropValue: {this.props.originalProp}</>;
            }
        }

        // act
        const WrappedComponent = withAuth(MyPropsComponent);
        render(
            <AuthProvider {...settingsStub}>
                <WrappedComponent originalProp="myvalue" />
            </AuthProvider>,
        );
        expect(await screen.findByText("originalPropValue: myvalue")).toBeInTheDocument();
    });
});
