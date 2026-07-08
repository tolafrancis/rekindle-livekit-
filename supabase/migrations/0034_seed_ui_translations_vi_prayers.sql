-- supabase/migrations/0034_seed_ui_translations_vi_prayers.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for PrayerJournal chrome
-- (namespace 'prayers'). reviewed=false; ON CONFLICT DO NOTHING.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','prayers','newEntry','Mục mới',false),
('vi','prayers','savePrayer','Lưu lời cầu nguyện',false),
('vi','prayers','prayerTitlePlaceholder','Tiêu đề lời cầu nguyện...',false),
('vi','prayers','selectCategory','Chọn danh mục',false),
('vi','prayers','pourHeartPlaceholder','Dốc đổ tấm lòng bạn ra với Chúa...',false),
('vi','prayers','searchPrayers','Tìm lời cầu nguyện...',false),
('vi','prayers','allCategories','Tất cả danh mục',false),
('vi','prayers','allStatus','Tất cả trạng thái',false),
('vi','prayers','noPrayersFound','Không tìm thấy lời cầu nguyện nào. Hãy bắt đầu ghi lại lời cầu nguyện của bạn!',false),
('vi','prayers','fillAllFields','Vui lòng điền đầy đủ các mục',false),
('vi','prayers','prayerAdded','Đã thêm lời cầu nguyện',false),
('vi','prayers','prayerAddedDesc','Lời cầu nguyện của bạn đã được ghi vào nhật ký',false),
('vi','prayers','praiseGod','Ngợi khen Chúa!',false),
('vi','prayers','prayerMarkedAnswered','Lời cầu nguyện đã được đánh dấu là được nhậm',false),
('vi','prayers','catThanksgiving','Tạ ơn',false),
('vi','prayers','catPetition','Cầu xin',false),
('vi','prayers','catIntercession','Cầu thay',false),
('vi','prayers','catConfession','Xưng tội',false),
('vi','prayers','catWorship','Thờ phượng',false),
('vi','prayers','catGuidance','Sự dẫn dắt',false)
on conflict (language_code, namespace, key) do nothing;
