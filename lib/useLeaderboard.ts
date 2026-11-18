"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSendCalls,
  useCallsStatus,
  useCapabilities,
} from "wagmi";
import type { Hex } from "viem";
import {
  LEADERBOARD_ABI,
  LEADERBOARD_ADDRESS,
  LEADERBOARD_CHAIN_ID,
  LEADERBOARD_PAYMASTER_URL,
  BUILDER_CODE_DATA_SUFFIX,
  leaderboardEnabled,
} from "./leaderboard";
import type { Run } from "./arena";

export interface TopEntry {
  player: `0x${string}`;
  score: bigint;
}

/** Top players from the contract (empty until the leaderboard is deployed). */
export function useTopScores() {
  const { data, refetch, isLoading } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: "getTop",
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: leaderboardEnabled() },
  });
  return {
    top: (data as readonly TopEntry[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}

/** Player's onchain best. */
export function useOnchainBest(address?: `0x${string}`) {
  const { data, refetch } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: "bestScore",
    args: address ? [address] : undefined,
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: leaderboardEnabled() && !!address },
  });
  return { best: (data as bigint | undefined) ?? BigInt(0), refetch };
}

export type SubmitPhase =
  | "idle"
  | "verifying" // server replays and signs
  | "submitting" // waiting for wallet signature / send
  | "confirming" // waiting for tx confirmation
  | "done"
  | "error";

/** Submit flow: /api/score (signature) → contract submitScore.
 *  If the wallet (smart wallet) supports EIP-5792 + paymaster and
 *  NEXT_PUBLIC_PAYMASTER_URL is set, the submit is gasless (sendCalls). Otherwise
 *  it's a normal tx (player pays gas). */
export function useSubmitScore() {
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifiedScore, setVerifiedScore] = useState<number | null>(null);
  const [hash, setHash] = useState<Hex | undefined>();
  const [callsId, setCallsId] = useState<string | undefined>();
  const [gasless, setGasless] = useState(false);

  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();

  // Does the connected wallet support gasless (only if the URL is set).
  const { data: capabilities } = useCapabilities({
    query: {
      enabled: !!LEADERBOARD_PAYMASTER_URL && leaderboardEnabled() && isConnected,
    },
  });
  const paymasterSupported =
    !!LEADERBOARD_PAYMASTER_URL &&
    !!capabilities?.[LEADERBOARD_CHAIN_ID]?.paymasterService?.supported;

  // Confirmation for a normal tx (EOA path).
  const { isSuccess: txMined } = useWaitForTransactionReceipt({
    hash,
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: !!hash && !callsId },
  });

  // Confirmation for a gasless bundle (EIP-5792).
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
      refetchInterval: (query) =>
        query.state.data?.status === "success" ? false : 1500,
    },
  });

  useEffect(() => {
    if (txMined) setPhase("done");
  }, [txMined]);

  useEffect(() => {
    if (callsStatus?.status === "success") {
      const h = callsStatus.receipts?.[0]?.transactionHash as Hex | undefined;
      if (h) setHash(h);
      setPhase("done");
    }
  }, [callsStatus]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setVerifiedScore(null);
    setHash(undefined);
    setCallsId(undefined);
    setGasless(false);
  }, []);

  const submit = useCallback(
    async (run: Run, address: `0x${string}`) => {
      if (!leaderboardEnabled() || !LEADERBOARD_ADDRESS) return;
      setError(null);
      setPhase("verifying");
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, run }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `Verifier error ${res.status}`);
        }
        const data = (await res.json()) as {
          score: number;
          nonce: string;
          signature: Hex;
        };
        setVerifiedScore(data.score);

        const args = [
          BigInt(data.score),
          BigInt(data.nonce),
          data.signature,
        ] as const;

        setPhase("submitting");
        if (paymasterSupported) {
          // Gasless: gas sponsored via CDP Paymaster (smart wallet).
          const result = await sendCallsAsync({
            calls: [
              {
                to: LEADERBOARD_ADDRESS,
                abi: LEADERBOARD_ABI,
                functionName: "submitScore",
                args,
              },
            ],
            capabilities: {
              paymasterService: { url: LEADERBOARD_PAYMASTER_URL as string },
              // Builder Code attribution (wallet ignores it if unsupported).
              dataSuffix: {
                value: BUILDER_CODE_DATA_SUFFIX,
                optional: true,
              },
            },
            chainId: LEADERBOARD_CHAIN_ID,
          });
          setGasless(true);
          setCallsId(typeof result === "string" ? result : result.id);
        } else {
          const txHash = await writeContractAsync({
            address: LEADERBOARD_ADDRESS,
            abi: LEADERBOARD_ABI,
            functionName: "submitScore",
            args,
            chainId: LEADERBOARD_CHAIN_ID,
            // Builder Code attribution, appended to the tx calldata.
            dataSuffix: BUILDER_CODE_DATA_SUFFIX,
          });
          setHash(txHash);
        }
        setPhase("confirming");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
        setPhase("error");
      }
    },
    [paymasterSupported, sendCallsAsync, writeContractAsync],
  );

  return { submit, reset, phase, error, verifiedScore, hash, gasless };
}
