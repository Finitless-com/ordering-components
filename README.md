# Finitless — Ordering Components

## Description

This repository contains a collection of functional components built with React Hooks and ES6. Each component is designed to be flexible and reusable, accepting any UI for use. The components are organized and structured with a focus on readability and maintainability.

**Repository:** [Finitless-com/ordering-components](https://github.com/Finitless-com/ordering-components)

## Components

The components in this repository are functional components, meaning they are stateless and do not have lifecycle methods. They are built using React Hooks, which allow us to manage state and side effects in these functional components.

## Usage

To use these components, simply import them into your project and pass in the necessary props. Each component accepts any UI for use, providing flexibility in how they are used and displayed.

## Installation

These components can be used as a submodule in another repository. To do so, add this repository as a submodule to your project:

```
git submodule add https://github.com/Finitless-com/ordering-components.git src/@/components
```

Or clone a parent repo that already includes it:

```
git clone --recursive https://github.com/Finitless-com/website-marketplace-v26.git
# or
git clone --recursive https://github.com/Finitless-com/ordering-app-marketplace-v26.git
# or
git clone --recursive https://github.com/Finitless-com/ordering-app-driver-26.git
# or
git clone --recursive https://github.com/Finitless-com/ordering-app-business-v26.git
```

Once added, you can import the components directly from the submodule. This allows you to keep your project and these components separate, making updates and maintenance easier.

## Sign-in props (session and `LoginForm`)

All of these are optional; an app that does not pass them behaves as before.

| Where | Prop | What it does |
|-------|------|--------------|
| `OrderingProvider` (web and native) | `sessionCheckInterval` | Period in ms of the poll that compares the stored session with the one in memory (another browser tab that logged in or out, a token replaced from outside). Default `2000`. `0`, `false` or `null` turn the poll **off**: use it in a React Native app, which has a single JS runtime. (`SessionProvider` takes the same value as `checkInterval`.) |
| `LoginForm` | `requestTimeout` | Time limit in ms of the sign-in request (`POST /auth`). When it expires the request is aborted and `formState` becomes `{ loading: false, result: { error: true, result: <message>, code: 'ERROR_REQUEST_TIMEOUT' } }`. A late answer never signs the user in. Without it there is no client time limit. |

`LoginForm` waits for the session to be stored (`login()` of `useSession`) before calling `handleSuccessLogin` and resolving `handleButtonLoginClick` (it resolves `true`). What the UI receives:

- `formState.loading` stays `true` after a successful sign-in until the app leaves the form (unchanged: a continuous spinner).
- `loginCompleted` (new prop, `false` by default): `true` once the session is stored. `formState` itself is not modified on success.
- If the session cannot be stored: `formState = { loading: false, result: { error: true, result: [message], code: 'ERROR_SESSION_STORAGE', reason: <error message> } }`.

The storage poll skips a tick while a `login()` / `logout()` is writing, and ticks never overlap.

## Format code

Run `yarn lint` to execute the linter.

## Tests and CI (ORD-1084)

```bash
COREPACK_ENABLE_STRICT=0 yarn install
yarn test
yarn lint:check
yarn test:coverage:summary
```

- **CI Quality Gate** on `main` and `production`: lint + tests + 70% average coverage (scoped include).
- Plan and progress: [docs/ci-coverage-plan.md](./docs/ci-coverage-plan.md)
- **Batch registry (read before each test session):** [docs/TEST_BATCH_REGISTRY.md](./docs/TEST_BATCH_REGISTRY.md)
- Branch protection setup: [docs/BRANCH_PROTECTION.md](./docs/BRANCH_PROTECTION.md)
- Bumping this submodule in consumer apps: [docs/CONSUMER_SUBMODULE.md](./docs/CONSUMER_SUBMODULE.md)
