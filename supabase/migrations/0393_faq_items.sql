-- 0393_faq_items.sql
-- =====================================================================
-- Admin-managed FAQ shown on the landing page and the /faq page (linked from
-- the Ministries hub). audience splits it for the two kinds of user:
--   'general'    – everyone (account, app, support)
--   'individual' – individual believers / Individual Partners
--   'ministry'   – ministry leaders & admins / Ministry Partners
-- Anyone (including signed-out visitors) reads published rows; only
-- platform admins (is_platform_admin, 0371) write.
-- =====================================================================

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'general' check (audience in ('general', 'individual', 'ministry')),
  question text not null,
  answer text not null,
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_faq_items_audience_order on public.faq_items (audience, display_order);

alter table public.faq_items enable row level security;

drop policy if exists p_faq_items_public_read on public.faq_items;
create policy p_faq_items_public_read on public.faq_items
  for select to anon, authenticated
  using (is_published or public.is_platform_admin(auth.uid()));

drop policy if exists p_faq_items_admin_write on public.faq_items;
create policy p_faq_items_admin_write on public.faq_items
  for all to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

grant select on public.faq_items to anon, authenticated;
grant insert, update, delete on public.faq_items to authenticated;

-- Starter content (only when the table is empty, so re-running never duplicates
-- or overwrites what admins have edited).
insert into public.faq_items (audience, question, answer, display_order)
select * from (values
  ('general', 'What is ReKindle BC?',
   'ReKindle BC is a faith-tech platform for believers, ministries and counsellors. Individuals use it for daily devotionals, prayer, Scripture memory and live worship. Ministries use it to go live, run meetings, care for their members and share the Word.', 10),
  ('general', 'Is ReKindle BC free?',
   'Yes. Devotionals, the prayer wall, joining live channels, prayer streaks, Scripture memory and GraceCounsel AI are free for everyone. Partner plans add extra tools and help keep the mission growing.', 20),
  ('general', 'Which devices can I use?',
   'Use ReKindle BC in any modern web browser, or install the Android app. Your account works the same everywhere.', 30),
  ('general', 'How do I contact support?',
   'Email support@rekindlebc.com and we will get back to you. For general questions you can also write to hello@rekindlebc.com.', 40),
  ('general', 'How do I delete my account or my data?',
   'You can leave a ministry and request deletion of your data from your membership profile. To delete your whole ReKindle BC account, email support@rekindlebc.com from the address on your account.', 50),

  ('individual', 'How do I join a ministry?',
   'Open the ministry''s invite link or scan its QR code, then sign in and complete the short registration.', 10),
  ('individual', 'How do I join a live service or meeting?',
   'Live channels you follow appear on your home screen when they go live. Meeting hosts share a link; open it, check your camera and microphone, and tap Join.', 20),
  ('individual', 'Can I read devotionals offline?',
   'Yes. Devotionals you have already opened stay available on your device, so you can keep reading without a connection.', 30),
  ('individual', 'What is GraceCounsel AI?',
   'GraceCounsel is an AI companion for prayer and encouragement rooted in Scripture. It is not a replacement for a pastor or professional counsellor; you can also book a counsellor in the app.', 40),
  ('individual', 'How do I join a small group?',
   'Inside your ministry, open Small Groups, then Discover. Tap Join on a public group, or Request to Join on a private one and wait for a leader to approve. A leader can also add you directly.', 50),
  ('individual', 'What does an Individual Partner plan include?',
   'Individual Partners get their own live channel to broadcast and meet, an AI note taker, and unlimited video conferencing and interactive meetings. Pricing is in NGN for Nigeria and USD elsewhere.', 60),
  ('individual', 'How do I update my membership details?',
   'Open the ministry, tap the profile icon at the top, and fill in or edit your membership profile. Your ministry leaders see the details you share.', 70),

  ('ministry', 'How do I create a ministry?',
   'From the Ministries hub tap Create Ministry, enter your ministry''s name and details, and follow the steps. You become the ministry''s owner and can invite your team.', 10),
  ('ministry', 'How do members join my ministry?',
   'Share your ministry''s invite link or QR code from Settings. Members open it, sign in and register. You can approve registrations and manage members from the Members area.', 20),
  ('ministry', 'What do the Ministry Partner plans include?',
   'Starter (up to 50 members), Growth Partner (up to 100), Ministry Partner (up to 300) and Ministry Plus (up to 600, with extra members in blocks of 500). Higher plans add the Ministry CRM, more meeting and broadcast hours, storage, WhatsApp broadcasts and more. See Billing for current prices.', 30),
  ('ministry', 'What happens when we reach our member limit?',
   'Admins get a warning when the ministry reaches 80% of its plan''s member limit, and again at the limit. Once the limit is reached new members cannot join until you upgrade or add a member block in Billing.', 40),
  ('ministry', 'Can we hold free meetings?',
   'Yes. Every ministry gets Free Ministry Meetings: 10 hours a month, up to 15 participants and 60 minutes per meeting. Partner plans raise these limits.', 50),
  ('ministry', 'How do I go live?',
   'Open your ministry''s live channel and start a broadcast. You can also stream with OBS and simulcast to YouTube and Facebook.', 60),
  ('ministry', 'How do small groups work?',
   'Admins create groups under Small Groups, then Manage Groups, and assign leaders. Group leaders manage their own group from My Groups: add members, approve requests, schedule meetings, take attendance and post updates.', 70),
  ('ministry', 'Can I use my own domain?',
   'Every ministry gets a free rekindlebc.com subdomain. Custom domains are set up with our team; email support@rekindlebc.com to arrange one.', 80),
  ('ministry', 'Do you support UK Gift Aid?',
   'Yes. Ministry Partner plans can record Gift Aid declarations and submit claims directly to HMRC, as a monthly add-on.', 90)
) as seed(audience, question, answer, display_order)
where not exists (select 1 from public.faq_items);
