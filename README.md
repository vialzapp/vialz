# Vialz

Paste a contract address, get a reading of a Robinhood Chain token straight from the chain: snipers, declared bundle,
top holders, linked wallets, the creator's earlier launches and volume quality. Read only: no wallet, no account.

```
apps/api        Node + Fastify. GET /v1/token/:address builds the report on demand; also serves the site
apps/web        the site (Vite + React): landing, /t/:address reports, /privacy
apps/extension  Chrome MV3 side panel
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

Extension: `cd apps/extension && npx vite build --mode development`, then in Chrome open `chrome://extensions`,
switch on Developer mode, Load unpacked, pick `apps/extension/dist`. Click the toolbar icon to open the side panel.

## Environment (API)

| variable | default | |
|---|---|---|
| `PORT` | 8787 | |
| `RH_RPC` | official Robinhood Chain RPC | must allow address-filtered `eth_getLogs` over wide ranges |
| `ETHERSCAN_API_KEY` | none | turns on funding clusters (who sent top holders their first ETH) |
| `VITE_API_URL` | build time, extension | API origin the extension calls |

## Official links

- X: [@vialzapp](https://x.com/vialzapp)
- The extension is only published from this repository's releases and the Chrome Web Store listing linked on X.

License: MIT. See [SECURITY.md](SECURITY.md) and [NOTICE.md](NOTICE.md).

## Notes

- The official RPC sits behind Cloudflare: requests go through `node:https`, because `fetch` gets a challenge page.
- It rate-limits heavy calls. Concurrency is 4, batches 40, 429s retried with backoff. A paid RPC removes the bottleneck.
- No historical state on the node: creation blocks are found by walking logs back from the head.
- Tokens with millions of transfers (PONS) hit a 15 s budget: market data only, holders marked as not read.
