# Continuing the Capacitor build on another machine

How to move the mobile-app work to a new computer without losing anything.
Companion to `docs/mobile-app-build-plan.md` and `docs/mobile-app-status.md`.

**Current state:** the Android native project is committed on branch
`feat/capacitor-ministry` (pushed to GitHub). Phases 0–2 done in code; nothing
has been run on a device yet (no Android toolchain installed on the current PC).

---

## ⚠️ Two things that do NOT travel via git

Everything else (all code, and the whole `apps/ministry/android/` native project)
is committed and comes with a normal `git clone`. These two do not:

### 1. `.env` files (secrets) — copy by hand
Git-ignored, so they are NOT in the repo:
- `apps/rekindle/.env`
- `apps/ministry/.env`

They hold the Supabase / Firebase / LiveKit keys. Without them the app builds but
can't reach any backend. **Copy both to the new machine over USB or a secure
channel — never email them or commit them.**

### 2. Uncommitted work on the OLD machine
Any change not committed stays only on the old PC. As of writing that includes
in-progress translation work (`LanguageManager.tsx`,
`process-translation-queue/index.sql`, and ~40 untracked `supabase/migrations/…`
files). The Capacitor build does not need it, but **commit + push or `git stash`
it before switching machines** or it's stranded.

```bash
# option A — save it to a branch so it's on GitHub
git add -A
git commit -m "wip: translation work"
git push -u origin <your-branch>

# option B — shelve it locally (stays on THIS machine only)
git stash
```

---

## On the NEW machine

### 1. Install prerequisites
- **Node** — match the old machine's major version (`node -v`), plus **Git**.
- **Android Studio** — https://developer.android.com/studio. It bundles the JDK
  and Android SDK (the pieces missing everywhere). On first run accept the
  default SDK Platform + Platform-Tools + Build-Tools.
- Ensure **`ANDROID_HOME`** points at the SDK (Android Studio usually sets it;
  otherwise `…/AppData/Local/Android/Sdk` on Windows, `~/Library/Android/sdk` on
  macOS).
- **iOS only:** a Mac with **Xcode**. There is no way to build iOS on Windows.
  Then follow `apps/ministry/ios-setup.md`.

### 2. Get the code
```bash
git clone https://github.com/tolafrancis/rekindle-livekit-.git
cd rekindle-livekit-
git checkout feat/capacitor-ministry
```

### 3. Restore secrets
Copy `apps/rekindle/.env` and `apps/ministry/.env` from the old machine into the
same folders here.

### 4. Install dependencies
Do **not** copy `node_modules` — reinstall (native binaries differ per OS):
```bash
npm install
```

### 5. Build & open Android
```bash
cd apps/ministry
npm run mobile:android    # vite build -> cap sync android -> cap open android
```
In Android Studio: let Gradle sync finish (first run downloads a lot — slow),
connect a phone with **USB debugging** enabled, then hit ▶ Run.

> For media testing (LiveKit camera/mic — the Phase 2 gate) use a **physical
> device**; emulators have poor/no camera.

---

## Things that are auto-handled (don't copy)

| Item | Why it's fine |
| --- | --- |
| `android/local.properties` | Machine-specific SDK path; regenerated from `ANDROID_HOME`. |
| `node_modules/` | Reinstalled by `npm install`; OS-specific binaries. |
| DB migrations (0245, etc.) | Already applied to the shared Supabase project — the new machine hits the same database, nothing to re-run. |
| Capacitor / plugin versions | Pinned in the committed `package-lock.json`. |

---

## Sanity check on the new machine
```bash
git rev-parse --abbrev-ref HEAD     # feat/capacitor-ministry
git status -sb                      # in sync with origin
ls apps/ministry/.env apps/rekindle/.env   # secrets present
ls apps/ministry/android/app/src/main/AndroidManifest.xml   # native project present
```
If all four are good, `npm run mobile:android` will build and open the project.

---

## Later (Phase 7) — the keystore

When you create the Android signing keystore for Play, it is git-ignored on
purpose (`*.jks`, `*.keystore`, `keystore.properties`) — so it will **not** travel
via git. Back it up somewhere safe and private; losing the upload key is a serious
problem. Not needed yet.
