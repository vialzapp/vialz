// Prints a report for one token: npm run check -w @vialz/api -- 0x…
import { analyzeToken } from "./analyze.js";
import { rpcStats } from "./rpc.js";

const token = (process.argv[2] ?? "").toLowerCase() as `0x${string}`;
const r = await analyzeToken(token);
console.error(`rpc requests: ${rpcStats.requests}, retries: ${rpcStats.retries}`);
console.log(JSON.stringify({ ...r, holders: { ...r.holders, top: r.holders.top.slice(0, 6) } }, null, 2));
