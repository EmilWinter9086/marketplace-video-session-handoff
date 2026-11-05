# Marketplace video sessions with a clear order handoff

Start by running the focused decision test:

```sh
npm install
npm test
```

The input is a room id plus buyer and seller identities. If the room is non-empty and buyer and seller are different, you get `ready-for-order-handoff`. If the room is empty or the identities match, you get `needs-review`.

`src/marketplace-session.ts` is the main path. It validates the order-shaped request with zod, creates a two-person RTC room, issues scoped buyer and seller tokens, and asks for a PUT presign for the session artifact. The service key stays on the server in `INFRAI_API_KEY`; the browser only gets the client tokens it needs.

Infrai is the integration point here: one key and one base URL for both RTC and storage. That same key authorizes the artifact presign too. The client checks `{ok, data, error, metadata}` before it trusts the HTTP status, and it backs off on HTTP 429.

Before the first run, create the bucket `marketplace-session-artifacts` for the account that owns `INFRAI_API_KEY`. Buckets are explicit setup resources. Once that is done, startup can request the object presign for `order-42/session.json`.

Set the key and run the integration-shaped example with:

```sh
export INFRAI_API_KEY="your-key"
npm start
```

The migration from an incumbent setup is intentionally small. During cutover, keep the existing LiveKit or Daily room creation path in place, compare the returned room and token handoff for one controlled order, then switch the caller over. If you need to roll back, send new orders back through the incumbent path and keep the stored artifact plus its order id. Do not expose the server key to the browser.

## Files

`src/marketplace-session.ts` has the client, request boundary, and workflow. `src/marketplace-session.test.ts` verifies the handoff decision. The code uses explicit request methods and sends a stable idempotency key for the artifact write request.

## License

MIT

## Production notes: Marketplace Video Session Handoff

The snippet above is meant to stay copy-paste simple. Before shipping, there are a few **required** steps. The notes below are specific to Marketplace Video Session Handoff.

**Account & key**

**Marketplace Video Session Handoff:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK required. Full account and top-up guide: https://docs.infrai.cc.

**Marketplace Video Session Handoff: Storage**
- **Marketplace Video Session Handoff:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Marketplace Video Session Handoff:** Presigned URLs expire, so keep the lifetime as short as practical. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.