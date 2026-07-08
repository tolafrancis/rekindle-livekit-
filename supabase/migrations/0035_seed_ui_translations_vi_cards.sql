-- supabase/migrations/0035_seed_ui_translations_vi_cards.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for AffirmationCard /
-- DeclarationCard chrome (namespace 'cards'). reviewed=false; ON CONFLICT DO NOTHING.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','cards','copiedToClipboard','Đã sao chép vào bộ nhớ tạm!',false),
('vi','cards','shareWithOthers','Chia sẻ điều này với người khác',false),
('vi','cards','removedFromSaved','Đã xóa khỏi mục đã lưu',false),
('vi','cards','saved','Đã lưu!',false),
('vi','cards','dailyAffirmation','Lời xác quyết hằng ngày',false),
('vi','cards','affirmation','Lời xác quyết',false),
('vi','cards','dailyDeclaration','Lời tuyên xưng hằng ngày',false),
('vi','cards','declaration','Lời tuyên xưng',false),
('vi','cards','listenToAffirmation','Nghe lời xác quyết',false),
('vi','cards','listenToDeclaration','Nghe lời tuyên xưng',false)
on conflict (language_code, namespace, key) do nothing;
