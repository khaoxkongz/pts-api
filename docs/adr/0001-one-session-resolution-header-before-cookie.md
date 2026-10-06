# One session resolution path; header token before signed cookie

Routes used to declare two Elysia macros, `isAuth` (signed `auth` cookie) and `isAuthWithToken` (`x-authorized-token` header), and the notification stream and `requireRole` each carried their own copy of the Session → User lookup. Because the later macro's `{ user: null }` overwrote the earlier one's result, cookie-only requests got 401 on every route that declared both. We replaced this with a single `resolveSessionUser` in the auth module and a single `isAuth` macro that tries the header token first (dev tools, scripts) and then the signed cookie, so the precedence is written down in one place instead of depending on option key order. No known client relied on the old cookie-only 401.

## Consequences

- `requireRole` resolves the user through the same path, so cookie users can pass role checks.
- The notification stream additionally accepts the session token as `?token=` (header, then query, then cookie), because a browser `EventSource` cannot send headers. No other route accepts a token in the URL, since URLs end up in access logs, history and Referer headers. `Authorization: Bearer` is not accepted anywhere.
- A database error during session lookup propagates as a 500 instead of being swallowed into a 401, so an outage does not look like every user being logged out.
