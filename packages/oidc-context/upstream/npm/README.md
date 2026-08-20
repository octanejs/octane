# react-oidc-context

[![Stable Release](https://img.shields.io/npm/v/react-oidc-context.svg)](https://npm.im/react-oidc-context)
[![CI](https://github.com/authts/react-oidc-context/actions/workflows/ci.yml/badge.svg)](https://github.com/authts/react-oidc-context/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/authts/react-oidc-context)](https://app.codecov.io/gh/authts/react-oidc-context)

Lightweight auth library using the
[oidc-client-ts](https://github.com/authts/oidc-client-ts) library for React
single page applications (SPA). Support for
[hooks](https://reactjs.org/docs/hooks-intro.html) and
[higher-order components (HOC)](https://reactjs.org/docs/higher-order-components.html).

## Table of Contents

- [Documentation](#documentation)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [Influences](#influences)
- [License](#license)

## Documentation

This library implements an auth context provider by making use of the
`oidc-client-ts` library. Its configuration is tight coupled to that library.

- [oidc-client-ts](https://github.com/authts/oidc-client-ts)

The
[`User`](https://authts.github.io/oidc-client-ts/classes/User.html)
and
[`UserManager`](https://authts.github.io/oidc-client-ts/classes/UserManager.html)
is held in this context, which is accessible from the
React application. Additionally it intercepts the auth redirects by looking at
the query/fragment parameters and acts accordingly. You still need to setup a
redirect uri, which must point to your application, but you do not need to
create that route.

To renew the access token, the
[automatic silent renew](https://authts.github.io/oidc-client-ts/interfaces/UserManagerSettings.html#automaticSilentRenew)
feature of `oidc-client-ts` can be used.

## Installation

Using [npm](https://npmjs.org/)

```bash
npm install oidc-client-ts react-oidc-context --save
```

Using [yarn](https://yarnpkg.com/)

```bash
yarn add oidc-client-ts react-oidc-context
```

## Getting Started

Configure the library by wrapping your application in `AuthProvider`:

```jsx
// src/index.jsx
import React from "react";
import ReactDOM from "react-dom";
import { AuthProvider } from "react-oidc-context";
import App from "./App";

const oidcConfig = {
  authority: "<your authority>",
  client_id: "<your client id>",
  redirect_uri: "<your redirect uri>",
  // ...
};

ReactDOM.render(
  <AuthProvider {...oidcConfig}>
    <App />
  </AuthProvider>,
  document.getElementById("app")
);
```

Use the `useAuth` hook in your components to access authentication state
(`isLoading`, `isAuthenticated` and `user`) and authentication methods
(`signinRedirect`, `removeUser` and `signOutRedirect`):

```jsx
// src/App.jsx
import React from "react";
import { useAuth } from "react-oidc-context";

function App() {
    const auth = useAuth();

    switch (auth.activeNavigator) {
        case "signinSilent":
            return <div>Signing you in...</div>;
        case "signoutRedirect":
            return <div>Signing you out...</div>;
    }

    if (auth.isLoading) {
        return <div>Loading...</div>;
    }

    if (auth.error) {
        return <div>Oops... {auth.error.source} caused {auth.error.message}</div>;
    }

    if (auth.isAuthenticated) {
        return (
        <div>
            Hello {auth.user?.profile.sub}{" "}
            <button onClick={() => void auth.removeUser()}>Log out</button>
        </div>
        );
    }

    return <button onClick={() => void auth.signinRedirect()}>Log in</button>;
}

export default App;
```

You **must** provide an implementation of `onSigninCallback` to `oidcConfig` to remove the payload from the URL upon successful login. Otherwise if you refresh the page and the payload is still there, `signinSilent` - which handles renewing your token - won't work.

A working implementation is already in the code [here](https://github.com/authts/react-oidc-context/blob/f175dcba6ab09871b027d6a2f2224a17712b67c5/src/AuthProvider.tsx#L20-L30).


### Use with a Class Component

Use the `withAuth` higher-order component to add the `auth` property to class
components:

```jsx
// src/Profile.jsx
import React from "react";
import { withAuth } from "react-oidc-context";

class Profile extends React.Component {
    render() {
        // `this.props.auth` has all the same properties as the `useAuth` hook
        const auth = this.props.auth;
        return <div>Hello {auth.user?.profile.sub}</div>;
    }
}

export default withAuth(Profile);
```

### Call a protected API

As a child of `AuthProvider` with a user containing an access token:

```jsx
// src/Posts.jsx
import React from "react";
import { useAuth } from "react-oidc-context";

const Posts = () => {
    const auth = useAuth();
    const [posts, setPosts] = React.useState(Array);

    React.useEffect(() => {
        (async () => {
            try {
                const token = auth.user?.access_token;
                const response = await fetch("https://api.example.com/posts", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                setPosts(await response.json());
            } catch (e) {
                console.error(e);
            }
        })();
    }, [auth]);

    if (!posts.length) {
        return <div>Loading...</div>;
    }

    return (
        <ul>
        {posts.map((post, index) => {
            return <li key={index}>{post}</li>;
        })}
        </ul>
    );
};

export default Posts;
```

As **not** a child of `AuthProvider` (e.g. redux slice) when using local storage
(`WebStorageStateStore`) for the user containing an access token:

```jsx
// src/slice.js
import { User } from "oidc-client-ts"

function getUser() {
    const oidcStorage = localStorage.getItem(`oidc.user:<your authority>:<your client id>`)
    if (!oidcStorage) {
        return null;
    }

    return User.fromStorageString(oidcStorage);
}

export const getPosts = createAsyncThunk(
    "store/getPosts",
    async () => {
        const user = getUser();
        const token = user?.access_token;
        return fetch("https://api.example.com/posts", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    },
    // ...
)
```

### Protect a route

Secure a route component by using the `withAuthenticationRequired` higher-order component. If a user attempts
to access this route without authentication, they will be redirected to the login page.

```jsx
import React from 'react';
import { withAuthenticationRequired } from "react-oidc-context";

const PrivateRoute = () => (<div>Private</div>);

export default withAuthenticationRequired(PrivateRoute, {
  OnRedirecting: () => (<div>Redirecting to the login page...</div>)
});
```

### Adding event listeners

The underlying [`UserManagerEvents`](https://authts.github.io/oidc-client-ts/classes/UserManagerEvents.html) instance can be imperatively managed with the `useAuth` hook.

```jsx
// src/App.jsx
import React from "react";
import { useAuth } from "react-oidc-context";

function App() {
    const auth = useAuth();

    React.useEffect(() => {
        // the `return` is important - addAccessTokenExpiring() returns a cleanup function
        return auth.events.addAccessTokenExpiring(() => {
            if (alert("You're about to be signed out due to inactivity. Press continue to stay signed in.")) {
                auth.signinSilent();
            }
        })
    }, [auth.events, auth.signinSilent]);

    return <button onClick={() => void auth.signinRedirect()}>Log in</button>;
}

export default App;
```

### Automatic sign-in

Automatically sign-in and silently reestablish your previous session, if you close the tab and reopen the application.

```jsx
// index.jsx
const oidcConfig: AuthProviderProps = {
    ...
    userStore: new WebStorageStateStore({ store: window.localStorage }),
};
```

```jsx
// src/App.jsx
import React from "react";
import { useAuth, hasAuthParams } from "react-oidc-context";

function App() {
    const auth = useAuth();
    const hasTriedSignin = React.useRef(false);

    // automatically sign-in
    React.useEffect(() => {
        if (!hasAuthParams() &&
            !auth.isAuthenticated && !auth.activeNavigator && !auth.isLoading &&
            !hasTriedSignin.current
        ) {
            auth.signinRedirect();
            hasTriedSignin.current = true;
        }
    }, [auth]);

    if (auth.isLoading) {
        return <div>Signing you in/out...</div>;
    }

    if (!auth.isAuthenticated) {
        return <div>Unable to log in</div>;
    }

    return <button onClick={() => void auth.removeUser()}>Log out</button>;
}

export default App;
```

#### useAutoSignin

Use the `useAutoSignin` hook inside the AuthProvider to automatically sign in.

```jsx
// src/App.jsx
import React from "react";
import { useAutoSignin } from "react-oidc-context";

function App() {
    // If you provide no signinMethod at all, the default is signinRedirect
    const { isLoading, isAuthenticated, error } = useAutoSignin({signinMethod: "signinRedirect"});

    if (isLoading) {
        return <div>Signing you in/out...</div>;
    }

    if (!isAuthenticated) {
        return <div>Unable to log in</div>;
    }

    if(error) {
        return <div>An error occured</div>
    }

    return <div>Signed in successfully</div>;
}

export default App;
```

## Contributing

We appreciate feedback and contribution to this repo!

## Influences

This library is inspired by [oidc-react](https://github.com/bjerkio/oidc-react),
which lacks error handling and
[auth0-react](https://github.com/auth0/auth0-react), which is focused on auth0.

## License

This project is licensed under the MIT license. See the
[LICENSE](https://github.com/authts/react-oidc-context/blob/main/LICENSE) file
for more info.
