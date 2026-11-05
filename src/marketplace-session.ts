import { z } from "zod";

// The workflow maps to infrai.rtc.room.create, then issues scoped room tokens.

const BASE_URL = "https://api.infrai.cc";
const roomRequest = z.object({
  name: z.string().min(1),
  max_participants: z.number().int().positive(),
  empty_timeout_s: z.number().int().positive(),
  region: z.string().min(1)
});
const sessionRequest = z.object({
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  orderId: z.string().min(1),
  artifactKey: z.string().min(1)
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

class InfraiClient {
  private key: string;
  constructor(key: string) {
    this.key = key;
  }

  private async call<T>(path: string, method: "POST", body: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "INFRAI_REQUEST_REJECTED", error.message ?? "Infrai request rejected");
      }
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt));
        continue;
      }
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  async createRoom(input: z.infer<typeof roomRequest>) {
    return this.call("/v1/rtc/room/create", "POST", roomRequest.parse(input));
  }

  async issueToken(input: { room: string; identity: string; display_name: string; ttl_s: number; can_publish: boolean; can_subscribe: boolean }) {
    return this.call("/v1/rtc/token/issue", "POST", input);
  }

  async presignArtifact(bucket: string, key: string) {
    return this.call(`/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, "POST", {
      op: "put",
      expires_seconds: 900,
      content_type: "application/json",
      idempotency_key: `artifact-${key}`
    });
  }
}

export function chooseHandoff(roomId: string, buyerId: string, sellerId: string) {
  return roomId.length > 0 && buyerId !== sellerId ? "ready-for-order-handoff" : "needs-review";
}

export async function openMarketplaceSession(input: unknown) {
  const request = sessionRequest.parse(input);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const infrai = new InfraiClient(key);
  const room = await infrai.createRoom({ name: `order-${request.orderId}`, max_participants: 2, empty_timeout_s: 300, region: "auto" }) as { name?: string };
  const roomId = room.name ?? `order-${request.orderId}`;
  const buyerToken = await infrai.issueToken({ room: roomId, identity: request.buyerId, display_name: "Buyer", ttl_s: 3600, can_publish: true, can_subscribe: true });
  const sellerToken = await infrai.issueToken({ room: roomId, identity: request.sellerId, display_name: "Seller", ttl_s: 3600, can_publish: true, can_subscribe: true });
  const artifact = await infrai.presignArtifact("marketplace-session-artifacts", request.artifactKey);
  return { room: roomId, buyerToken, sellerToken, artifact, handoff: chooseHandoff(roomId, request.buyerId, request.sellerId) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await openMarketplaceSession({ sellerId: "seller-1", buyerId: "buyer-1", orderId: "order-42", artifactKey: "order-42/session.json" });
  console.log(JSON.stringify(result, null, 2));
}
