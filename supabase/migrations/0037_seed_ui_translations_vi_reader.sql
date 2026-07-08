-- supabase/migrations/0037_seed_ui_translations_vi_reader.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for the DevotionalModule reader
-- slides (namespace 'devotionals', reader* keys). Pastoral/liturgical text; the
-- closing is the Aaronic blessing (Numbers 6:24-26) in a gentle paraphrase.
-- reviewed=false; ON CONFLICT DO NOTHING. Multi-line values use E'...\n...'.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','devotionals','readerScripturePassage','Phân đoạn Kinh Thánh',false),
('vi','devotionals','readerBiblePassage','Đoạn Kinh Thánh',false),
('vi','devotionals','readerReadSlowly','Hãy đọc chậm rãi. Hãy để những lời này lắng đọng trong lòng bạn.',false),
('vi','devotionals','readerDevotional','Bài tĩnh nguyện',false),
('vi','devotionals','readerReflectionQuestions','Câu hỏi suy ngẫm',false),
('vi','devotionals','readerReflectionContent','Hãy suy ngẫm xem lẽ thật này gặp gỡ bạn ngay tại nơi bạn đang đứng hôm nay như thế nào.',false),
('vi','devotionals','readerGuidedPrayer','Lời cầu nguyện hướng dẫn',false),
('vi','devotionals','readerPrayInSpirit','Cầu nguyện trong Thánh Linh',false),
('vi','devotionals','readerPrayInSpiritContent',E'Không cần vội vàng. Hãy ở lại bao lâu bạn cần.\n\nKhi bạn sẵn sàng, hãy nhẹ nhàng đánh dấu thời gian này là hoàn tất.',false),
('vi','devotionals','readerGoInPeace','Đi trong bình an',false),
('vi','devotionals','readerGoInPeaceContent',E'Nguyện Chúa ban phước cho bạn và gìn giữ bạn.\nNguyện mặt Ngài chiếu sáng trên bạn và ban bình an cho bạn.\nHãy ra đi trong tình yêu của Ngài hôm nay.',false),
('vi','devotionals','readerWelcome','Chào mừng bạn đến với bài tĩnh nguyện hôm nay. Thời gian này được biệt riêng cho bạn và Chúa.',false),
('vi','devotionals','readerWrittenBy','Viết bởi',false),
('vi','devotionals','readerAdditionalScripture','Kinh Thánh bổ sung',false)
on conflict (language_code, namespace, key) do nothing;
