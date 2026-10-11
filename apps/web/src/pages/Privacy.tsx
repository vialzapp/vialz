export function Privacy() {
  return (
    <section className="prose-page">
      <div className="wrap prose">
        <h1>Privacy</h1>
        <p className="prose-date">Last updated 11 October 2026</p>

        <h2>What Vialz does</h2>
        <p>
          Vialz reads public data from Robinhood Chain and shows it as a report about a token. It never connects to a wallet, never asks for a private key or
          signature, and has no accounts.
        </p>

        <h2>What leaves your device</h2>
        <p>
          When you check a token, its contract address is sent to the Vialz server, which reads the chain and returns the report. Nothing else about you is
          sent: no wallet address, no browsing history, no identifiers.
        </p>
        <p>
          The server keeps ordinary request logs (time, requested token, IP address) for up to 14 days to keep the service running and to stop abuse. They are
          not sold or shared.
        </p>

        <h2>The Chrome extension</h2>
        <p>The extension asks for two permissions:</p>
        <ul>
          <li>
            <b>Active tab</b>, only at the moment you click the Vialz icon and only for that tab: its address bar is read to find a contract address,
            which never leaves your device unless you check that token. Page content, other tabs and your browsing history are never read.
          </li>
          <li>
            <b>Storage</b>, to keep your last checked tokens on your device. They never leave it.
          </li>
        </ul>

        <h2>Third parties</h2>
        <p>
          Market data for tokens trading on Uniswap comes from DexScreener and the ETH price from Coinbase. Those requests are made by the Vialz server, not by
          your browser. Token images are fetched from public IPFS gateways by the Vialz server too, so your browser only talks to Vialz.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy: reach the Vialz team on X,{" "}
          <a href="https://x.com/vialzapp" target="_blank" rel="noopener noreferrer">
            @vialzapp
          </a>
          , or write to <a href="mailto:hello@vialz.xyz">hello@vialz.xyz</a>.
        </p>
      </div>
    </section>
  );
}
