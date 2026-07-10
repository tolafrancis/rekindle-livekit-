# Self-host LiveKit on a Hostinger VPS — step by step

This gets the LiveKit stack running on your Hostinger **VPS** (KVM plan — not shared
web hosting) and points the Rekindle app at it. Follow top to bottom.

**You need:**
- A Hostinger **VPS** with Ubuntu 22.04 and its **public IP**.
- A domain you control (to make a `livekit.<domain>` subdomain).
- *(for recording only)* an S3-compatible bucket (Cloudflare R2 is cheapest).

**Sizing:** the SFU alone is light. **Egress (recording) runs a headless Chrome and
needs ≥2 vCPU / 8 GB.** On the smallest plan, prove calls first, add recording later.

---

## 1. Point a subdomain at the VPS

In your DNS (Hostinger hPanel → Domains → DNS zone, or your registrar):
```
A   livekit   →   <your VPS public IP>
```
Wait a few minutes, then confirm from your PC: `ping livekit.<yourdomain>` shows the VPS IP.

## 2. SSH into the VPS
```bash
ssh root@<your VPS public IP>
```
(Set the root password / SSH key in hPanel → VPS if you haven't.)

## 3. Open the firewall

On the VPS:
```bash
ufw allow 22/tcp                 # SSH (don't lock yourself out)
ufw allow 80,443/tcp             # TLS (Caddy + Let's Encrypt)
ufw allow 7881/tcp               # RTC TCP fallback
ufw allow 3478/udp               # TURN
ufw allow 50000:50100/udp        # RTC media
ufw allow 1935/tcp               # RTMP ingest (only if you use OBS)
ufw --force enable
```
Also check hPanel → VPS → **Firewall**: if a panel firewall is on, add the same rules there.

## 4. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
docker --version     # confirm it installed
```

## 5. Get the LiveKit stack onto the VPS
```bash
git clone https://github.com/tolafrancis/rekindle-livekit- rekindle
cd rekindle/livekit
cp .env.example .env
```

## 6. Create the secret — on the VPS, never in git

`.env` is gitignored and ships **empty of secrets**. Generate yours here, on the box:

```bash
cd ~/rekindle/livekit
openssl rand -hex 32          # copy this — you need it once more, in step 9
nano .env
```
Fill in:
```
LIVEKIT_API_SECRET=<the value you just generated>
S3_ACCESS_KEY=minioadmin
S3_SECRET=<a second: openssl rand -hex 16>
```

> **Never put a secret in a tracked file.** `config/livekit.yaml` has no `keys:` block
> on purpose — compose injects it from `.env` as `LIVEKIT_KEYS`, and Egress/Ingress get
> their whole config the same way (`*_CONFIG_BODY`). A secret that reaches a commit is
> public the moment you push: rotate it, don't try to scrub history.

Then edit **`config/Caddyfile`** — replace `livekit.example.com` with **`livekit.<yourdomain>`**.

`config/livekit.yaml` already has `use_external_ip: true` (required on a cloud box) and
the Supabase `livekit-webhook` URL. Its `webhook.api_key: devkey` is a key **name**, not
a secret — it only has to match `LIVEKIT_API_KEY` in `.env`.

## 7. Start it
```bash
docker compose --profile tls up -d      # --profile tls also starts Caddy for HTTPS
docker compose ps                       # livekit, egress, redis, caddy = Up
docker compose logs -f livekit          # watch for a clean start (Ctrl-C to stop watching)
docker compose logs caddy               # should show a cert issued for your domain
```

## 8. Verify the server is reachable

From your PC, in a browser, open: `https://livekit.<yourdomain>` — you should get a
small LiveKit response (not a cert warning). If the cert is valid, `wss://` works.

## 9. Point the app at it

Now use `wss://livekit.<yourdomain>` everywhere (this is your self-hosted URL):

- **Client** — in the repo `.env` on the machine you build the web app:
  ```
  VITE_LIVEKIT_URL=wss://livekit.<yourdomain>
  VITE_VIDEO_BACKEND=livekit
  ```
  then `npm run build` and redeploy the web app to Hostinger.
- **Supabase → Edge Functions → Secrets** — `LIVEKIT_API_SECRET` must be **byte-for-byte**
  the value in the VPS `.env`, or every token the edge functions mint is rejected 401:
  ```
  LIVEKIT_URL        = wss://livekit.<yourdomain>
  LIVEKIT_API_KEY    = devkey
  LIVEKIT_API_SECRET = <the openssl value from step 6>
  ```
  These two places — VPS `.env` and Supabase secrets — are the **only** two that hold it.
- Deploy the 5 edge functions + run migrations `0145`–`0147` (§18 runbook).

## 10. Test end to end

- App → join a meeting → DevTools → Network → **WS** connects to `livekit.<yourdomain>`.
- Two browsers on different networks see + hear each other (**proves TURN/NAT**).
- Go live as host, view in a second browser → sub-second, no Daily/Mux.

---

## Recording (Egress) notes
- Egress needs **Redis** (already in the compose) + the `S3_*` creds in `.env`.
- Recordings land in your R2/S3; front them with a CDN later (`stream.<domain>`,
  [../cdn-playback-origin.md](../cdn-playback-origin.md)).

## Troubleshooting
- **Caddy cert fails:** DNS not pointing at the VPS yet, or port 80/443 blocked. Fix DNS/firewall, `docker compose restart caddy`.
- **Calls connect but no audio/video across networks:** TURN/UDP blocked — recheck the `3478/udp` + `50000:50100/udp` firewall rules (this is the #1 self-host issue).
- **`401`/tokens rejected:** the Supabase secret doesn't match the VPS `keys:` secret. They must be byte-for-byte identical.
- **Config change not taking effect:** `docker compose restart livekit egress` (configs are read at start).
