# ReKindle Translator — Windows Desktop Edge Agent

The Windows desktop client for church PA systems and sound booths, serving as the live audio bridge between physical sound boards and the ReKindle Cloud Translation Bot.

---

## 1. Architecture Overview

```text
[ Pastor's Microphone ]
           │
           ▼
[ Sound Mixer AUX SEND ] ──(Line In)──> [ ReKindle Desktop App ]
                                                 │ (48kHz Mono, WebRTC AEC/NS/AGC OFF)
                                                 ▼
                                        [ LiveKit Cloud Room ]
                                                 │
                                                 ▼
                                        [ Cloud Translation Bot ]
                                                 │ (STT -> Translate -> TTS)
                                                 ▼
                                        [ LiveKit Cloud Room ]
                                                 │ (Track: rlt-translated-{lang})
                                                 ▼
[ Sanctuary Sound System ] <──(Line Out)── [ ReKindle Desktop App ]
 (Mixer AUX RETURN Channel)
```

1. **Hardware Bridge**: Captures the pastor's raw speech directly from the mixer's AUX SEND bus and publishes it into LiveKit as `pa-device-{device_id}`.
2. **Audio Processing Rules**: Acoustic Echo Cancellation (`echoCancellation: false`), Noise Suppression (`noiseSuppression: false`), and Auto Gain Control (`autoGainControl: false`) are **explicitly disabled** to prevent audio pumping and clipping of sermon dynamics.
3. **Translated Audio Return**: Subscribes dynamically to the cloud translation bot's track (`rlt-translated-{targetLanguage}`) and routes it to the sound board's AUX RETURN for local playback.
4. **Security**: Hardware device keys (`rlt_...`) and 24-hour bearer tokens are encrypted via Windows SafeStorage DPAPI.

---

## 2. Development & Building

### Running in Development
```bash
npm.cmd install
npm.cmd run dev --workspace=rekindle-translator-desktop
```

### Compiling Windows Binaries
```bash
# Compile unsigned Windows portable and NSIS installer (.exe)
npm.cmd run build:win --workspace=rekindle-translator-desktop
```
Installers and portable binaries will be output to `apps/desktop/release/`.

---

## 3. Pre-Service Setup Wizard (5 Steps)

1. **Step 1 — Device Key**: Enter your church ministry's hardware device key (`rlt_...`). The app calls `authenticate_device(key)` to mint a 24-hour bearer token and auto-refreshes it every 60 seconds.
2. **Step 2 — Sound Board I/O & Languages**: Choose your USB audio interface input (AUX SEND) and output (AUX RETURN), plus source and target languages.
3. **Step 3 — Output Test Tone**: Emits a 1,000 Hz sine wave tone through the output to calibrate line gain on your sound board.
4. **Step 4 — Hardware Safety Warning**: Explains the danger of 3.5mm combo TRRS laptop jacks and reminds sound engineers to isolate the AUX RETURN channel from the AUX SEND bus.
5. **Step 5 — Ready**: Summarizes routing and launches the 2-button Daily Service View.

---

## 4. Daily Sound Booth Operation

* **Start Service**: Starts keepalive heartbeat, triggers `device_start_session` on the database, mints LiveKit token, and begins streaming sermon audio.
* **Stop Service**: Gracefully stops capture, disconnects from LiveKit room, and marks the session as `ended`.
* **System Tray**: Closing the window minimizes the app to the Windows System Tray so the service continues running uninterrupted in the background.
