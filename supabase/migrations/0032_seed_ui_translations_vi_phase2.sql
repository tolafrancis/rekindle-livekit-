-- supabase/migrations/0032_seed_ui_translations_vi_phase2.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for UI keys added while wiring
-- previously-hardcoded strings to t(). Batch 1: AppLayout sidebar / secondary
-- nav labels.
--
-- reviewed=false; ON CONFLICT DO NOTHING so re-runs never overwrite reviewed edits.
-- Mirrors the new navigation keys added to DEFAULT_TRANSLATIONS in src/lib/i18n.ts.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','navigation','theWord','Lời Chúa',false),
('vi','navigation','discover','Khám phá',false),
('vi','navigation','myMinistries','Mục vụ của tôi',false),
('vi','navigation','manage','Quản lý',false),
('vi','navigation','events','Sự kiện',false),
('vi','navigation','following','Đang theo dõi',false),
('vi','navigation','myChannels','Kênh của tôi',false),
('vi','navigation','meetings','Cuộc họp',false),
('vi','navigation','feed','Bảng tin',false),
('vi','navigation','music','Âm nhạc',false),
('vi','navigation','module','Danh mục',false)
on conflict (language_code, namespace, key) do nothing;
