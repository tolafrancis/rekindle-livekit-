# Phase 1 — Package Extraction Map

**Status:** ✅ Complete (planning artifact — no code moved). Covers **all 445 files** under
`src/`, classified file-by-file into the six shared packages vs. the two apps.
**Source:** master plan §9 first deliverable + §2 package layout
([MASTER-PLAN-ministry-standalone.md](../MASTER-PLAN-ministry-standalone.md)).
**Method:** mechanical dirs (`types`, `ui`, `functions`, `ministry`, `registration`,
`giftAid`, `platform-admin`, `auth`) + `lib`/`hooks`/`contexts`/`data`/`pages` classified
directly; the 214 top-level `components/*` classified by 4 parallel content-reading passes.

> This map governs **Phase 1** (extract shared packages *in place*, `apps/rekindle` keeps
> importing them) and pre-stages **Phase 2** (which app each non-shared surface lands in).
> Phase 1 only extracts the `pkg:*` rows. The `app:*` rows stay put until Phase 2.

---

## Extraction order (least-dependent first, one PR each)
Per the plan's dependency spine: **types → supabase → auth → live → ui → features.**
`features` is last because it depends on all the others. Within each PR: move files →
add package `package.json` → re-point `apps/rekindle` imports → `tsc` clean → commit.

| Package | Files | What it holds |
|---|---:|---|
| `packages/types` | 10 | all shared TS types |
| `packages/supabase` | 8 | client, edge-fn invokers, query/mutation helpers |
| `packages/auth` | 14 | auth/session, entitlements, subscription + tenant context |
| `packages/live` | ~45 | LiveKit + legacy Mux/Daily video/streaming/recording |
| `packages/ui` | ~72 | design system (`components/ui/*`) + generic widgets |
| `packages/features` | ~110 | shared content domains (devotional/prayer/TTS/i18n/…) |
| `apps/rekindle` (stays) | ~90 | consumer-only surfaces + platform-admin |
| `apps/ministry` (Phase 2) | ~65 | church-console surfaces |
| `app:both` (review) | 5 | app-shell screens spanning both — Phase 2 decision |

---

## `packages/types` (10) — `src/types/*`
`Languagetypes`, `MinistryVideoMeetingsTypes`, `bulkTTS`, `database-types`,
`liveChannelAnalyticsTypes`, `liveChannelTypes`, `prayerChallengeTypes`, `prayerTypes`,
`replay`, `videoRoom`.

## `packages/supabase` (8)
- `lib/supabase.ts` (client), `lib/schemaValidator.ts` (schema helper)
- `lib/functions/*` (5 edge-fn invokers) — **[REV] add `livekit-*` + `meeting-ai` invokers here**
- `hooks/useSupabaseMutation.ts`

## `packages/auth` (14)
- `lib/subscriptionEnforcement.ts`, `lib/ReplayEntitlements.ts`, `lib/aiCompanionLimits.ts`,
  `lib/ministryPermissions.ts`, `lib/middleware/tenantMiddleware.ts`
- `contexts/AuthContext.tsx`
- `components/auth/*` (LoginForm, SignupForm, PasswordResetForm, OnboardingFlow)
- `hooks/useUpgradePrompt.ts`, `hooks/useUserEntitlements.ts`
- `components/`: `ReplayAccessGate`, `SubscriptionManager`, `UpgradePromptModal`

## `packages/live` (~45) — includes legacy Mux/Daily behind the flag
- **lib:** `LiveKitRoomWrapper`, `videoBackend`, `muxStream`, `muxMeetingStream`,
  `daily-recordings`, `simulcastDestinations`, `recordingRetention`,
  `liveChannelAnalyticsService`
- **hooks:** `useChannelAnalytics`, `useDailyRoom`, `useMeetingChat`, `useMeetingPresence`,
  `useMeetingReactions`, `useMeetingStage`
- **components:** `DailyVideoCall`, `Dailyaudio`, `CounsellingVideoSession`, `HlsPlayer`,
  `MuxVodPlayer`, `HostControlPanel`, `VideoCallControls`, `ConnectionQualityIndicator`*,
  `ChannelStreamConfig`, `ChannelRecordingsViewer`, `RecordingManager`,
  `RecordingRetentionBadge`, `ChatSidebar`, `RoomChatSidebar`, all `LiveChannel*` (11),
  all `Meeting*` panels (`MeetingChatPanel`, `MeetingReactions`, `MeetingRecordings`),
  `RealTimeChat`†
  - *`ConnectionQualityIndicator` is generic enough for `ui`; leaving in `live` by usage.
  - †see the meeting-AI seam note below.

## `packages/ui` (~72)
- `lib/utils.ts` (cn/tailwind-merge)
- `hooks/`: `use-mobile`, `use-toast`, `useSwipe`
- `components/ui/*` (49 shadcn primitives)
- `components/`: `AppFooter`, `AppErrorBoundary`, `ErrorBoundary`, `BackToTop`, `BadgeCard`,
  `CommentSection`, `CoverImageField`, `DevotionalCard`, `SearchFilterPanel`, `StatCard`,
  `theme-provider`, `Skeleton*` (`SkeletonDevotionalCard`, `SkeletonMentorCard`,
  `SkeletonPrayerList`), stub placeholders `HealthStatusCard`, `CommunityReactions`,
  `CommunityTrendingTopics`

## `packages/features` (~110) — the shared content engine
- **lib (33):** i18n/translation (`i18n`, `PreTranslationUtils`, `translationQueueService`,
  `bibleLocalization`, `bibleApi`), AI (`AiSpiritualCompanion`, `meetingAIEngine`),
  gamification (`achievementTracker`, `streak`), community integrations
  (`communityActivityService`, `devotionalCommunityIntegration`,
  `prayerLibraryCommunityIntegration`, `prayerSeriesCommunityIntegration`,
  `liveChannelAndBookIntegration`), devotional (`devotionalStreams`, `devotionalShare`),
  sharing/links (`liveShare`, `webShare`, `givingLinks`), audio/TTS (`openaiTTSService`,
  `musicStorage`), notifications (`notify`, `firebase`‡), offline
  (`OfflineCacheManager`, `offlineContentCache`, `ServiceWorker`), onboarding
  (`onboardingTips`, `onboarding-tips-function`), referrals (`referralService`,
  `referralSignupIntegration`), kiosk/QR (`qrCode`), `deepLink`, `categoryDisplay`
- **hooks (12):** `Useaudioplayer`, `useMeetingNotes`, `useLocalizedContent`,
  `useLocalizedScripture`, `useTranslation`, `useNotifications`, `usePushNotifications`,
  `useOfflineStorage`, `useOfflineSync`, `useOnboardingTips`, `useReadingPlan`,
  `useUserAnalytics`
- **contexts:** `LanguageContext`
- **data (10):** `affirmations`, `badges`, `bible`, `bibleVerses`, `books`, `declarations`,
  `devotionals`, `instrumentals`, `prayers`, `readingPlans`
- **components (~54):** devotionals (`DevotionalLibrary`, `DevotionalModule`,
  `DevotionalReader`, `DevotionalSeriesViewer`, `DevotionalProgress*`, `DevotionalBookmarks`,
  `DevotionalSourceSettings`, `DailyDevotionalWidget`), prayer (`PrayerLibrary`,
  `PrayerSeriesViewer`, `InteractivePrayerSession`, `PrayerJournal`, `PrayerPointModal`,
  `PrayerTopicCard`, `EnhancedPrayerChallenges`, `GroupPrayerChallenge`, `ChallengeCard`,
  `ChallengeAnalytics`, `CreateChallengeModal`, `PrayerTimer*`), affirmations/declarations
  (`AffirmationCard`, `DeclarationCard`), AI (`AiPrayerGenerator`, `AiScriptureGuidance`,
  `AiSpiritualCompanionChat`, `GraceCounselChat`), bible/reading (`BibleReadingPlan`,
  `BibleReadingTracker`, `BiblePlan*`, `BibleProgressChart`, `ReadingPlanManager`,
  `ScriptureMemory`, `ScriptureSelector`), books (`BookSummaries`), audio/TTS
  (`HighQualityAudioPlayer`, `InstrumentalPlayer`, `MusicLibrary`, `MusicSelector`,
  `UniversalTTSExportButton`, `viewerGestures`), community (`CommunityActivityFeed`,
  `CommunityLeaderboard`, `CommunityPrayerWall`, `CommunityRevelations`), notifications
  (`NotificationFeed`, `PushNotificationSettings`, `DailyReminders`, `ReminderSetupTip`),
  i18n (`LanguageSettings`, `LanguageFallbackMessage`, `TranslateNowButton`,
  `TranslationProgressIndicator`), search (`GlobalSearch`, `Search*` stubs), sharing
  (`SocialShareModal`, `ShareChallengeModal`, `ShareGroupModal`, `Share*` stubs), offline
  (`OfflineIndicator`, `SyncStatusBar`), rewards (`RewardsAndAchievements`, `StreakWidget`),
  referrals (`ReferralSystem`, `ReferralGenerator`, `ReferralInvite`)
- ‡`firebase.ts` (FCM web-push init) is cross-cutting — candidate for its own tiny
  `packages/push` if `features` gets heavy.

---

## Stays in `apps/rekindle` (~90) — consumer + platform-admin
- **pages/routes:** `pages/*` (7), `routes/routesLiveChannels`
- **data:** `counsellors`, `mentors`
- **platform-admin:** `components/platform-admin/*` (11), `components/counselling/*`
- **All `Admin*` authoring/moderation tools (25)** — global content authoring over shared
  (incl. ministry) content: devotional/prayer/series/book/affirmation/declaration managers,
  translation dashboards, bulk-TTS, leaderboard, subscription, system-health, etc.
- **counsellor/mentor:** `CounsellorDashboard`, `CounsellorCard`, `CounsellorBookingModal`,
  `CounsellorApplication*`, `MentorCard`†, `MentorBookingModal`† (†thin re-exports of the
  Counsellor components), `MyBookings`, `SessionRatingModal`, `CounsellingChatSidebar`
- **personal/consumer:** `ProfileSettings`, `UserActivityDashboard`, `PaymentHistory`,
  `DataExportButton`/`DataExportPage`, `OnboardingFlow`§, `OnboardingTips`,
  `PartnerDonationPage`, `SponsorshipSystem`, `WhatsAppOptIn`, `PrivacyPolicy`,
  `TermsOfService`, `AppLayout`, `AnalyticsDashboard`, `EmailNotificationManager`,
  `ContentTranslationManager`, `CommunityPrayerManager`, `CommunityRevelationsManager`,
  `PrayerChallengeBackendManager`, `ReferralAdminManager`, `PlatformAdminMinistries`,
  `AiCompanionAdminSettings`, `BulkTTS*`

## Moves to `apps/ministry` (Phase 2, ~65) — church console
- `components/ministry/*` (24), `components/registration/*` (5), `components/giftAid/*` (5),
  `lib/giftAid/*` (11)
- `components/`: `MinistriesHub`◇, `MinistrySpace`◇, `MinistryDevotionalCreator`,
  `MinistryDevotionalsManager`, `MinistryGroupsManager`, `MinistryInteractiveMeetings`,
  `MinistryLiveHub`, `MinistryLiveWrapper`, `MinistryRecordingsTab`, `MLiveChannel`,
  `BroadcastMessaging`, `BroadcastWallet`, `AdminBroadcastLogViewer`, `AdminMinistryGroups`,
  `AdminWhatsAppManager`, `DonationForm`, `DonationsManagement`, `PaymentSettingsForm`,
  `PaymentSettingsDialog`
  - These consume `packages/live`, `packages/features`, `packages/ui` — they render the
    ministry world over shared code.

## `app:both` — Phase 2 decision (5)
`Index` (root shell/router), `AppContext` (sidebar state), `SharedContentPreview` +
`Skeleton` (public share-link/meeting-join pages spanning consumer **and** ministry
content), and the ◇-flagged `MinistriesHub`/`MinistrySpace` (ministry-branded but
consumed by member discovery). Decide per-file: duplicate into each app, or host a thin
shared shell.

---

## Findings the map surfaced (act on these)
1. **Empty stub files (~14)** — placeholder-only components: `PrayerTimer`,
   `PrayerTimerCircularDisplay`, `PrayerTimerSettings`, `MinistryLiveHub`, `BiblePlan*`,
   `BibleProgressChart`, `Search*`, `ShareDevotional`, `SharePrayerCard`, `SyncStatusBar`,
   `UserActivityLog`, `CommunityReactions`, `CommunityTrendingTopics`, `HealthStatusCard`,
   `AdminTestimonyManager`, `AdminVideoCallManager`, `AdminErrorBoundaryTest`,
   `AdminActivityLogFilters/Table`, `SystemHealthDashboard`, `WhatsAppSettings` (returns
   null). **Don't extract dead weight** — decide delete-vs-implement before moving each.
2. **Deprecated shims / re-exports** — `GroupChat`, `SocialPrayerGroups`,
   `EnhancedPrayerGroups` all just render `LiveChannels`; `MentorCard`/`MentorBookingModal`
   re-export `Counsellor*`; `WhatsAppSettings` superseded by `PlatformWhatsAppOptIn`.
   Collapse these rather than carry them into packages.
3. **Duplicate `OnboardingFlow`** — `components/auth/OnboardingFlow.tsx` (→ `pkg:auth`)
   **and** top-level `components/OnboardingFlow.tsx` (consumer → `apps/rekindle`). Confirm
   they're genuinely different before extraction; rename to disambiguate.
4. **Meeting-AI ↔ live seam** — `meetingAIEngine` + `useMeetingNotes` (AI notes) belong in
   `features` per the plan, but the meeting UI panels (`MeetingInsightsPanel`,
   `MeetingTranscriptionPanel`, `MeetingRecordingPanel`, `SavedMeetingInsights`,
   `MeetingNotesBanner`) are `live`. Since `live` extracts **before** `features`, define a
   clean interface: keep the AI engine/hook in `features` and have those panels depend on
   `features` (live → features is fine; avoid the reverse). Or co-locate the whole AI-notes
   subsystem in `features`. **Pick one before the `live` PR.**
5. **`live` carries legacy Mux/Daily** (`muxStream`, `muxMeetingStream`, `daily-recordings`,
   `MuxVodPlayer`, `ChannelStreamConfig`, `ChannelRecordingsViewer`) — per plan these ride
   along behind `VITE_VIDEO_BACKEND` until the **Phase 7b** teardown. Tag them `@legacy` so
   the extracted package is easy to slim later.

## Next
Phase 1 map is done and unblocks **Phase 0** (monorepo shell). Recommended: execute Phase 0
(pnpm + Turborepo, move app into `apps/rekindle/`, add empty `apps/ministry` + `packages/`),
then extract packages in the order above, resolving findings 1–5 as each package's PR comes up.
