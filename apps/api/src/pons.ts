// Pons launchpad (V2) on Robinhood Chain: addresses, events and decoders.
// Addresses and event layouts as documented in the gradgate engine (MIT) and checked on chain on 10.10.2026.
import { decodeAbiParameters, encodeFunctionData, parseAbi, toFunctionSelector, type Hex } from "viem";

export const FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
// the factory's first log: nothing launched through Pons before this block, so no search needs to go further back
export const FACTORY_START = 26_841_846;
export const ROUTER = "0xe33e9e479df8802cb0866d5d05258bec4cf62948";
export const HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
export const LOCKER = "0x267444d099b10fb5ed7c3cc7b7c767adca574952";
export const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
export const FOMO_ROUTER = "0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f";

export const TOKEN_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607"; // (token, curve, creator) indexed; data: quote, ?, threshold
export const POOL_GRADUATED = "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259"; // token indexed
export const CURVE_BUY = "0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455"; // (caller, buyer); data: quoteIn, tokensOut, fee, fee
export const CURVE_SELL = "0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df"; // (seller, seller); data: tokensIn, quoteOut, fee, fee
export const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const ZERO = "0x0000000000000000000000000000000000000000";
export const DEAD = "0x000000000000000000000000000000000000dead";

export const PHASES = ["curve", "swept", "pool", "rescued"] as const;

const abi = parseAbi([
  "function getLaunchedToken(address token) view returns (address,address,address,address,address,uint256,uint24,int24,uint16,bool,uint8,uint256,uint256,uint256,bool)",
  "function getTokenInfo() view returns (address,string,string,(string,string,string,string,string))",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

export const callData = {
  getLaunchedToken: (token: string) => encodeFunctionData({ abi, functionName: "getLaunchedToken", args: [token as Hex] }),
  getTokenInfo: () => encodeFunctionData({ abi, functionName: "getTokenInfo" }),
  name: () => encodeFunctionData({ abi, functionName: "name" }),
  symbol: () => encodeFunctionData({ abi, functionName: "symbol" }),
  decimals: () => encodeFunctionData({ abi, functionName: "decimals" }),
  totalSupply: () => encodeFunctionData({ abi, functionName: "totalSupply" }),
};

export function words(data: string): bigint[] {
  const d = data.slice(2);
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= d.length; i += 64) out.push(BigInt("0x" + d.slice(i, i + 64)));
  return out;
}

export interface LaunchRecord {
  curve: string;
  feeRecipient: string;
  pair: string;
  creatorTaxBps: number;
  phase: (typeof PHASES)[number] | "unknown";
}

/** factory.getLaunchedToken(token): null when the token is not a Pons V2 launch. */
export function decodeLaunched(r: unknown): LaunchRecord | null {
  if (typeof r !== "string" || r.length < 2 + 64 * 15) return null;
  try {
    const v = decodeAbiParameters(
      [
        { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "address" },
        { type: "uint256" }, { type: "uint24" }, { type: "int24" }, { type: "uint16" }, { type: "bool" },
        { type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" },
      ],
      r as Hex,
    );
    if (!v[14]) return null;
    return {
      curve: v[1].toLowerCase(),
      feeRecipient: v[3].toLowerCase(),
      pair: v[4].toLowerCase(),
      creatorTaxBps: Number(v[8]),
      phase: PHASES[Number(v[10])] ?? "unknown",
    };
  } catch {
    return null;
  }
}

export interface TokenInfo {
  image: string | null;
  description: string | null;
  x: string | null;
  telegram: string | null;
  website: string | null;
}

/** token.getTokenInfo(): logo, description and socials {twitter, telegram, discord, website, farcaster}. */
export function decodeTokenInfo(r: unknown): TokenInfo | null {
  if (typeof r !== "string" || r === "0x") return null;
  try {
    const [, logo, desc, soc] = decodeAbiParameters(
      [
        { type: "address" }, { type: "string" }, { type: "string" },
        { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }] },
      ],
      r as Hex,
    );
    const clean = (s: string) => s.trim() || null;
    const s = soc as unknown as string[];
    return { image: clean(logo), description: clean(desc), x: clean(s[0] ?? ""), telegram: clean(s[1] ?? ""), website: clean(s[3] ?? "") };
  } catch {
    return null;
  }
}

const LAUNCH_AND_BUY = toFunctionSelector(
  "launchAndBuy((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,uint256,uint256,address,address[])",
);

/** The launch transaction's calldata when it went through launchAndBuy: the dev buy and the wallets declared exempt from the opening tax. */
export function decodeLaunchAndBuy(input: string | undefined): { devBuyWei: bigint; exempt: string[] } | null {
  if (!input || !input.toLowerCase().startsWith(LAUNCH_AND_BUY)) return null;
  try {
    const v = decodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" },
            { type: "tuple", components: [{ type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }] },
            { type: "address" }, { type: "uint16" }, { type: "bool" }, { type: "bytes32" }, { type: "bytes32" },
          ],
        },
        { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "address[]" },
      ],
      ("0x" + input.slice(10)) as Hex,
    );
    return { devBuyWei: v[3], exempt: (v[6] as readonly string[]).map((a) => a.toLowerCase()) };
  } catch {
    return null;
  }
}

export function decodeString(r: unknown): string {
  if (typeof r !== "string" || r === "0x") return "";
  try {
    return decodeAbiParameters([{ type: "string" }], r as Hex)[0].slice(0, 64);
  } catch {
    // some tokens return bytes32 names
    const hex = r.slice(2, 66);
    return Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/, "").slice(0, 64);
  }
}

export const decodeUint = (r: unknown): bigint | null => (typeof r === "string" && r.length > 2 ? BigInt(r.slice(0, 66)) : null);
