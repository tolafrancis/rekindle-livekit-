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
git clone <your-repo-url> rekindle
cd rekindle/livekit
cp .env.example .env
```

## 6. Edit three files

**a) `config/livekit.yaml`** — turn on public-IP mode (required on a cloud box):
```yaml
rtc:
  use_external_ip: true     # was false
```
The `keys:` secret and `webhook.urls` are already set. (The webhook URL should be your
Supabase `livekit-webhook` function URL — it already points there.)

**b) `config/Caddyfile`** — replace `livekit.example.com` with **`livekit.<yourdomain>`**.

**c) `.env`** — the `LIVEKIT_*` values are already set. For recording, fill the `S3_*`
lines with your R2 bucket creds (skip for now if you only want live calls).

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
- **Supabase → Edge Functions → Secrets** (must match the VPS `keys:` exactly):
  ```
  LIVEKIT_URL        = wss://livekit.<yourdomain>
  LIVEKIT_API_KEY    = devkey
  LIVEKIT_API_SECRET = e6381ce27b5bb267a688339cbfd73ea4710a0c95bdb5498e52d93cf1ec21ab6c
  ```
  *(rotate that secret for real prod — see livekit/README.md — and update it in both
  places at once.)*
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
