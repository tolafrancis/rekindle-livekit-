# Self-hosted LiveKit stack — Phase 0 (Infra + spike)

This directory stands up the four services the migration runs on — **SFU**
(the room), **Egress** (recording/HLS/RTMP-out), **Ingress** (RTMP/WHIP in),
and **TURN** (NAT traversal) — plus Redis and a dev MinIO S3 target, and a
throwaway browser spike to prove them end-to-end.

> Goal of Phase 0: prove all four services work **before** any app refactor.
> The #1 self-host risk is TURN/NAT — validate it here, not in Phase 4.
> See [../docs/livekit-migration-plan.md](../docs/livekit-migration-plan.md) §6.

```
livekit/
├── docker-compose.yml      # SFU + Egress + Ingress + Redis + MinIO (+ optional coturn)
├── .env.example            # infra secrets (copy → .env)
├── config/
│   ├── livekit.yaml        # SFU + embedded TURN
│   ├── egress.yaml         # recording → MinIO/S3
│   ├── ingress.yaml        # RTMP/WHIP in
│   └── coturn.conf         # optional prod-grade TURN
└── spike/
    ├── index.html          # self-contained browser spike (livekit-client via CDN)
    └── mint-token.mjs       # dependency-free dev JWT minter (node:crypto)
```

Nothing here imports from the app or touches `package.json` — it's disposable.

---

## 1. Stand it up (dev)

```bash
cd livekit
cp .env.example .env          # edit if you want; defaults work locally
docker compose up -d
docker compose ps             # livekit, egress, ingress, redis, minio all "Up"
docker compose logs -f livekit
```

Ports: SFU `7880` (ws) · TURN `3478/udp` · RTMP ingest `1935` · WHIP `8080` ·
MinIO API `9000`, console `9001` (minioadmin/minioadmin).

> **Docker Desktop (mac/Windows) caveat:** host networking is limited, so media
> flows over the published UDP range `50000–50100` + TURN. Two browser tabs on
> the same machine will connect. The *real* NAT test is on a Linux box with
> `network_mode: host` and `use_external_ip: true` (see §4).

---

## 2. Spike: 2-peer A/V + screen share

Mint two tokens (needs Node; no npm install required):

```bash
# from repo root
node livekit/spike/mint-token.mjs --room spike --identity alice --name Alice
node livekit/spike/mint-token.mjs --room spike --identity bob   --name Bob
```

Each prints a token **and** a ready `spike/index.html?url=…&token=…` link.
Open one link in a normal window, the other in a private window (two identities).
In each: **Connect → Camera → Mic → Share screen**. You should see/hear the other
tab, and the log should show `connection state: connected` with ICE succeeding.
If media only connects when both tabs are local but fails across networks, TURN
is the culprit — fix here.

---

## 3. Spike: Egress recording + Ingress (OBS)

These use the LiveKit CLI (`lk`). Install:
<https://github.com/livekit/livekit-cli> (`brew install livekit-cli`, or the
Windows release binary). Point it at the dev stack:

```bash
export LIVEKIT_URL=ws://localhost:7880
export LIVEKIT_API_KEY=devkey
export LIVEKIT_API_SECRET=devsecret_please_change_me_0123456789abcdef
```

**Egress → storage** (record the room while the two tabs are joined):

```bash
lk egress start --type room-composite \
  --room spike --layout grid \
  --s3 endpoint=http://localhost:9000,bucket=livekit-egress,access-key=minioadmin,secret=minioadmin,region=us-east-1,force-path-style=true \
  --output spike-recording.mp4
# stop when done:
lk egress list
lk egress stop <egress-id>
```
Confirm `spike-recording.mp4` appears at the MinIO console → bucket `livekit-egress`
(http://localhost:9001). **Stopping matters** — egress bills/consumes until stopped
(risk register). No orphans.

**Ingress ← OBS (RTMP):** create an ingress bound to the room, then feed OBS:

```bash
lk ingress create --type rtmp --room spike --name obs --identity obs-cam
# prints a URL like  rtmp://localhost:1935/x  + a stream key
```
In OBS → Settings → Stream → Custom: Server = the printed URL, Key = the printed
key → Start Streaming. `obs-cam` should appear as a participant in both browser
tabs. Clean up: `lk ingress list` → `lk ingress delete <id>`.

---

## 4. Going to production

- **TLS/domains:** browsers require `wss://` for a hosted site. Terminate TLS at a
  load balancer / reverse proxy in front of `7880`, and set client `VITE_LIVEKIT_URL=wss://livekit.yourdomain.com`.
- **External IP:** on a cloud box, set `use_external_ip: true` in `config/livekit.yaml`
  and open the media UDP range on the firewall/security-group.
- **TURN:** for real NAT traversal prefer dedicated **coturn** with TLS on `5349`
  (`docker compose --profile coturn up -d`, set `turn.enabled:false` in livekit.yaml,
  fill `external-ip`/certs in `coturn.conf`).
- **Networking:** on Linux prefer `network_mode: host` for `livekit` (delete the
  `ports:` block) so media ports and IP detection are reliable.
- **Secrets:** replace the `devsecret_…` value everywhere (livekit.yaml, egress.yaml,
  ingress.yaml, .env). Secret must be ≥ 32 chars. Inject via env in prod, don't
  commit real secrets.
- **Storage:** delete the `minio`/`minio-setup` services; point `egress.yaml` `s3`
  (or `gcp`/`azure`) at real object storage.

The same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` become **Supabase function secrets**
in Phase 1, and `VITE_LIVEKIT_URL` (the `wss://` URL) becomes the client env var.

---

## Phase 0 exit checklist

- [ ] `docker compose up -d` → all services `Up` (livekit, egress, ingress, redis, minio).
- [ ] Two browser tabs join room `spike`; each sees the other's camera + hears mic.
- [ ] Screen share from one tab renders as a separate tile in the other.
- [ ] **TURN/NAT proven** on the real deploy target (not just localhost).
- [ ] One Egress room-composite recording lands in storage — and **stops cleanly**.
- [ ] One OBS RTMP feed via Ingress appears as a room participant.
- [ ] Secrets + `VITE_LIVEKIT_URL` decided (wired into the app in Phase 1).

When every box is checked, Phase 0 is done and Phase 1 (control plane) can start.
