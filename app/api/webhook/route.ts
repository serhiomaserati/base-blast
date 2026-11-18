import { NextRequest, NextResponse } from "next/server";

/**
 * Farcaster / Base App mini-app webhook.
 *
 * Clients (Farcaster, Base App) send signed mini app lifecycle events here.
 * Body is a JSON Farcaster Signature: { header, payload, signature },
 * each field is base64url-encoded JSON.
 *
 *   header  -> { fid, type, key }
 *   payload -> { event, notificationDetails? }
 *
 * Events: "frame_added" | "frame_removed" |
 *          "notifications_enabled" | "notifications_disabled".
 *
 * To actually send push notifications later, store
 * notificationDetails.{url,token} in a persistent KV store (Upstash Redis etc.)
 * keyed by header.fid. No store is wired up yet, so the event is just
 * validated and acked (200) so the manifest is valid for listing.
 */

type WebhookEvent =
  | "frame_added"
  | "frame_removed"
  | "notifications_enabled"
  | "notifications_disabled";

interface WebhookPayload {
  event: WebhookEvent;
  notificationDetails?: { url: string; token: string };
}

function decodeBase64UrlJson<T>(value: string): T {
  // base64url -> base64
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json) as T;
}

export async function POST(request: NextRequest) {
  let body: { header?: string; payload?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.header || !body?.payload || !body?.signature) {
    return NextResponse.json(
      { message: "Missing header/payload/signature" },
      { status: 400 },
    );
  }

  let header: { fid: number; type: string; key: string };
  let payload: WebhookPayload;
  try {
    header = decodeBase64UrlJson(body.header);
    payload = decodeBase64UrlJson(body.payload);
  } catch {
    return NextResponse.json({ message: "Malformed event" }, { status: 400 });
  }

  // Notification token storage goes here:
  switch (payload.event) {
    case "frame_added":
    case "notifications_enabled":
      // TODO: save payload.notificationDetails by header.fid in the KV store.
      console.log(`[webhook] ${payload.event} fid=${header.fid}`);
      break;
    case "frame_removed":
    case "notifications_disabled":
      // TODO: delete the saved token for header.fid.
      console.log(`[webhook] ${payload.event} fid=${header.fid}`);
      break;
    default:
      console.log(`[webhook] unknown event fid=${header.fid}`);
  }

  return NextResponse.json({ success: true });
}
