# Vialz

Paste a contract address, get a reading of a Robinhood Chain token straight from the chain: snipers, declared bundle,
top holders, linked wallets, the creator's earlier launches and volume quality. Read only: no wallet, no account.

```
apps/api        Node + Fastify. GET /v1/token/:address builds the report on demand; also serves the site
apps/web        the site (Vite + React): landing, /t/:address reports, /privacy
apps/extension  Chrome MV3 toolbar popup
packages/shared report types, address parsing, formatting, the six readings
packages/ui     shared React components and design tokens (site and extension use the same ones)
```

## Run locally

Node 22+.

```bash
npm install
npm run dev:api        # http://localhost:8787
npm run dev:web        # http://localhost:5180, proxies /v1 to the API
```

Extension: install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/vialz-token-check-for-rob/fbnjfjdoddglgmpjfgcpfjdnobnddinb),
or load `vialz-extension.zip` from the [latest release](https://github.com/vialzapp/vialz/releases/latest) by hand (unzip, `chrome://extensions`,
Developer mode, Load unpacked). To build it yourself: `cd apps/extension && npx vite build --mode development`, then load `apps/extension/dist`.

## Environment (API)

| variable | default | |
|---|---|---|
| `PORT` | 8787 | |
| `RH_RPC` | official Robinhood Chain RPC | must allow address-filtered `eth_getLogs` over wide ranges |
| `BLOCKSCOUT_API_KEY` | none | Blockscout's index of the chain, for busy tokens: holder count, top 50 holders, the creator's transfers |
| `BLOCKSCOUT_DAILY_CALLS` | 4500 | Blockscout calls per day (UTC) before the index switches off until tomorrow |
| `HEAVY_HOLDERS` | 4000 | holder count from which a token is read from the index instead of its full transfer history |
| `FUNDING` | off | `on` adds funding links (who sent top holders their first ETH); needs `ETHERSCAN_API_KEY` and a paid Etherscan plan for chain 4663 |
| `ETHERSCAN_API_KEY` / `ETHERSCAN_DAILY_BUDGET` | none / 80000 | only with `FUNDING=on` |
| `PUBLIC_URL` | https://vialz.xyz | origin used in link-card meta tags |
| `CLIENT_IP_HEADER` | none | header the hosting edge sets to the connecting IP (`x-real-ip` on Railway). Behind the Cloudflare proxy the visitor's `CF-Connecting-IP` is used, only for connections from Cloudflare's ranges |
| `TRUST_PROXY_HOPS` | 0 | trusted proxies in X-Forwarded-For, for hosts whose edge rewrites that header |
| `TOKEN_PER_MINUTE` | 15 | token reports per client IP per minute |
| `MAX_RUNNING` / `MAX_WAITING` | 3 / 24 | fresh chain reads at once, and how many may wait before clients get 503 |
| `VITE_API_URL` | build time, extension | API origin the extension calls |

## Official links

- Site: [vialz.xyz](https://vialz.xyz)
- X: [@vialzapp](https://x.com/vialzapp)
- Code: [github.com/vialzapp/vialz](https://github.com/vialzapp/vialz)
- Extension: [Chrome Web Store](https://chromewebstore.google.com/detail/vialz-token-check-for-rob/fbnjfjdoddglgmpjfgcpfjdnobnddinb), or the zip in this repository's [releases](https://github.com/vialzapp/vialz/releases). Any other copy is not ours.

License: MIT. See [SECURITY.md](SECURITY.md) and [NOTICE.md](NOTICE.md).

## Notes

- The official RPC sits behind Cloudflare: requests go through `node:https`, because `fetch` gets a challenge page.
- It rate-limits heavy calls. Concurrency is 4, batches 40, 429s retried with backoff. A paid RPC removes the bottleneck.
- No historical state on the node: creation blocks are found by walking logs back from the head.
- Busy tokens (4000+ holders) are not read transfer by transfer: holders come from Blockscout's index, snipers from the
  launch window, and linked wallets and volume are marked as not read.
