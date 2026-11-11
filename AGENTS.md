<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Escrow e2e tests live in tests/e2e and run against the real backend with E2E_* test-account env vars; they skip when those are absent, so CI without accounts stays green.
- Seller dashboard status classification lives in a browser-safe tested helper so filters, counts and renewal eligibility agree.
- Store breeder-entered animal age as a leading description line so existing listing reads display it without a database migration.
