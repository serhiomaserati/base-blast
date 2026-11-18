// Client side of the leaderboard contract: ABI + address/network from public env.

export const LEADERBOARD_ABI = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTop",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "score", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "bestScore",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const LEADERBOARD_ADDRESS = process.env
  .NEXT_PUBLIC_LEADERBOARD_ADDRESS as `0x${string}` | undefined;

export const LEADERBOARD_CHAIN_ID =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532; // Base Sepolia by default

/** CDP Paymaster URL for gasless submits from a smart wallet (empty = player pays gas). */
export const LEADERBOARD_PAYMASTER_URL =
  process.env.NEXT_PUBLIC_PAYMASTER_URL || undefined;

/** ERC-8021 attribution suffix for Builder Code `bc_h8896xf8` (base.dev).
 *  Precomputed with `ox/erc8021` Attribution.toDataSuffix. Appended to the
 *  submitScore calldata so the app's onchain volume is attributed to the builder
 *  (payout = main wallet), which is what the builder score is based on. */
export const BUILDER_CODE_DATA_SUFFIX: `0x${string}` =
  "0x62635f68383839367866380b0080218021802180218021802180218021";

/** Leaderboard is on only when a contract address is set. */
export const leaderboardEnabled = (): boolean => !!LEADERBOARD_ADDRESS;
