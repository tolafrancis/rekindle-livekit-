-- supabase/migrations/0036_seed_ui_translations_vi_devotionals.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for DailyDevotionalWidget chrome
-- (namespace 'devotionals'). reviewed=false; ON CONFLICT DO NOTHING.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','devotionals','todaysDevotional','Tĩnh nguyện hôm nay',false),
('vi','devotionals','dailyScriptureReflection','Suy ngẫm Kinh Thánh hằng ngày',false),
('vi','devotionals','reflectionQuestions','Câu hỏi suy ngẫm:',false),
('vi','devotionals','readTime','~8 phút',false),
('vi','devotionals','previewAudio','Nghe thử âm thanh',false),
('vi','devotionals','audioPreview','Nghe thử âm thanh',false),
('vi','devotionals','experienceAgain','Trải nghiệm lại',false),
('vi','devotionals','startTodaysDevotional','Bắt đầu tĩnh nguyện hôm nay',false),
('vi','devotionals','startMinistryDevotional','Bắt đầu tĩnh nguyện mục vụ',false),
('vi','devotionals','ministryDevotional','Tĩnh nguyện mục vụ',false),
('vi','devotionals','shareDevotional','Chia sẻ bài tĩnh nguyện',false),
('vi','devotionals','noMinistryDevotional','Chưa có bài tĩnh nguyện mục vụ nào. Hãy quay lại sớm!',false),
('vi','devotionals','noDevotionalToday','Không có bài tĩnh nguyện nào cho hôm nay. Hãy quay lại vào ngày mai!',false),
('vi','devotionals','copiedToShare','Đã sao chép để chia sẻ!',false),
('vi','devotionals','copiedToShareDesc','Thông điệp tĩnh nguyện đã có trong bộ nhớ tạm của bạn — dán vào bất cứ đâu để mời ai đó.',false)
on conflict (language_code, namespace, key) do nothing;
