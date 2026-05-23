# Module Recovery Matrix

Use this after each product recovery deploy. Mark manually in the browser after clearing site data.

| Module | Route | Opens? | Crashes? | Blank screen? | Router issue? | Hydration issue? | Auth issue? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login | `/app/login` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | Manual login only |
| Module center | `/app` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | Requires valid session |
| Dashboard | `/overview` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Masalar | `/floor` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Adisyon | `/orders?tableId=...` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | Product insertion target |
| Products | `/products` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Stock | `/warehouse` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Reports | `/reports` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Settings | `/settings` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| KDS | `/kds` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | Bounded fallback sync |

## Product Recovery Pass Criteria

- Login screen appears at `/app/login`.
- `/app` does not render module center for invalid sessions.
- Every module either opens or shows a local error state.
- No module freezes the entire app shell.
- No recursive redirects.
- No repeated auth retry spam.
- No blank dark screen.
