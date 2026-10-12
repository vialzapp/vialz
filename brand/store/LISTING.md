# Chrome Web Store listing: Vialz 1.0.0

Everything below goes into the Chrome Web Store developer dashboard. The files sit next to this one.

## Package

- `vialz-extension-1.0.0.zip`: upload on the **Package** tab. Built from `apps/extension`, manifest version 1.0.0, permissions `activeTab` and `storage` only.

## Store listing tab

**Name** (from the manifest): Vialz: token check for Robinhood Chain

**Summary** (from the manifest, 119 characters):
Click the icon on a token page to see snipers, the bundle, linked wallets and the dev's bag, read from Robinhood Chain.

**Description:**

```
Vialz reads any Robinhood Chain token straight from the chain, from the page you are already on.

Open a token on gmgn, fomo, DexScreener or a block explorer and click the Vialz icon. The token on that page is read on the spot. Anywhere else, paste a contract address or a link.

What you see:

• Snipers: wallets that bought in the first 3 seconds after launch, and how much they still hold
• Bundle: the wallets the creator set up at launch, and what they hold now
• Top 10: how much of the supply the ten biggest wallets control, with the curve, pools, burn address and contracts left out
• Linked wallets: one wallet handing the token out to a group of holders who still hold it
• The creator: every earlier Pons launch from the same wallet, how many graduated, and whether they sold early
• The creator's own bag: how much they bought and for how much ETH, how much they sold, burned or moved to other wallets, and what they hold now
• Volume: how much of it comes from five wallets, and how many wallets keep flipping
• Market cap, liquidity or what the curve holds, holders, age and progress to graduation on Pons

Six vials sum it up. Each fills with the colour of its reading, and the stronger the reading, the fuller it gets.

What Vialz does not do:

• It never connects to a wallet, never asks for a signature and never trades. It only reads.
• It gives no score and no verdict. It shows what the chain shows, and you decide.
• It has no account. Your recent checks stay on your device.

Free and open source.
```

**Category:** Tools
**Language:** English

**Graphic assets:**
- Store icon: taken from the package (`icons/icon-128.png`, 96 px artwork with 16 px transparent padding)
- Screenshots, 1280x800, in this order:
  1. `screenshot-1.png`: Read the chain before you ape
  2. `screenshot-2.png`: Six vials. One look.
  3. `screenshot-3.png`: Who really holds it
  4. `screenshot-4.png`: What the dev did with their own bag
- Small promo tile 440x280: `promo-small-440x280.png`
- Marquee promo tile 1400x560: `promo-marquee-1400x560.png`

**Additional fields:**
- Official URL / homepage: https://vialz.xyz (it shows a placeholder until launch)
- Support URL: https://x.com/vialzapp

## Account tab (developer profile)

- Publisher name: Vialz
- Contact email: hello@vialz.xyz (verify it; mail forwards through Cloudflare)
- Trader status: Non-trader (free tool, nothing sold)

## Privacy tab

**Single purpose:**
```
Vialz shows on-chain facts about a Robinhood Chain token (snipers, bundle wallets, holders, linked wallets, the creator's history and trading activity) for the token on the page the user is viewing or the address the user pastes.
```

**Permission justification, activeTab:**
```
When the user clicks the Vialz toolbar icon, the extension reads the address bar of that one tab to find a token contract address (for example on gmgn, fomo or DexScreener token pages) so the user does not have to copy it. It reads nothing else from the page, no other tab, and nothing when the icon is not clicked.
```

**Permission justification, storage:**
```
Keeps the user's last checked tokens (contract address, symbol and the six readings) on the device so they can open them again from the popup. It also remembers whether the user hid the tip about pinning the icon. Nothing stored leaves the device, and the user can clear the list.
```

**Remote code:** No, I am not using remote code. All JavaScript ships in the package. The extension only fetches JSON reports from https://vialz.xyz.

**Data usage:**
- Data collected: none of the listed categories. The only thing sent is the contract address of the token being checked, which is public on-chain data, not user data. No browsing history, page content, identifiers or location are sent or stored.
- Tick all three certifications: no selling or transferring of user data to third parties; no use or transfer for purposes unrelated to the single purpose; no use or transfer to determine creditworthiness or for lending.

**Privacy policy URL:** https://vialz.xyz/privacy (public even while the site is closed)

## Distribution tab

- Visibility: Public
- Regions: all

## Submitting

- Submit with automatic publishing **off** if the dashboard offers it. The item then waits, approved, until launch day, and is published by hand in the same hour the site opens.
- Before every resubmission, raise `version` in `apps/extension/public/manifest.json`, rebuild, re-zip.
