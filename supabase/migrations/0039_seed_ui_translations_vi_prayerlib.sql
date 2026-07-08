-- supabase/migrations/0039_seed_ui_translations_vi_prayerlib.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for PrayerLibrary chrome
-- (ShareButton + toasts + tabs + duration dialog, namespace 'prayers').
-- "Prayer Watch" => "canh nguyện" (vigil). {watch}/{topic} placeholders kept.
-- reviewed=false; ON CONFLICT DO NOTHING.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','prayers','linkCopied','Đã sao chép liên kết!',false),
('vi','prayers','linkCopiedDesc','Đã sao chép liên kết chia sẻ vào bộ nhớ tạm',false),
('vi','prayers','failedLoadSeries','Không thể tải loạt bài cầu nguyện',false),
('vi','prayers','prayerCompleted','Hoàn thành cầu nguyện! 🙏',false),
('vi','prayers','prayerCompletedDesc','Hoạt động cầu nguyện của bạn đã được chia sẻ với cộng đồng',false),
('vi','prayers','prayerWatchCompleted','Hoàn thành phiên canh nguyện! 🙏',false),
('vi','prayers','prayerWatchCompletedDesc','Phiên canh nguyện trung tín của bạn đã được ghi lại',false),
('vi','prayers','joinedPrayerWatch','Đã tham gia phiên canh nguyện!',false),
('vi','prayers','joinedPrayerWatchDesc','Bạn đã tham gia phiên canh nguyện {watch}',false),
('vi','prayers','noPrayerContent','Không có nội dung cầu nguyện',false),
('vi','prayers','noPrayerContentDesc','Hiện chưa có nội dung cầu nguyện cho {topic}.',false),
('vi','prayers','signInBookmarkSeries','Vui lòng đăng nhập để lưu dấu loạt bài',false),
('vi','prayers','removed','Đã xóa',false),
('vi','prayers','seriesRemovedBookmarks','Đã xóa loạt bài khỏi dấu trang',false),
('vi','prayers','bookmarked','Đã lưu dấu',false),
('vi','prayers','seriesAddedBookmarks','Đã thêm loạt bài vào dấu trang',false),
('vi','prayers','notSupported','Không được hỗ trợ',false),
('vi','prayers','notificationsNotSupported','Trình duyệt này không hỗ trợ thông báo',false),
('vi','prayers','notificationsEnabled','Đã bật thông báo',false),
('vi','prayers','notificationsEnabledDesc','Bạn sẽ nhận được lời nhắc canh nguyện',false),
('vi','prayers','enableNotificationsSettings','Vui lòng bật thông báo trong cài đặt trình duyệt của bạn',false),
('vi','prayers','signInReminders','Vui lòng đăng nhập để đặt lời nhắc',false),
('vi','prayers','reminderSet','Đã đặt lời nhắc',false),
('vi','prayers','reminderSetDesc','Bạn sẽ được nhắc trước 10 phút khi đến {watch}',false),
('vi','prayers','reminderRemoved','Đã xóa lời nhắc',false),
('vi','prayers','reminderRemovedDesc','Lời nhắc canh nguyện đã được tắt',false),
('vi','prayers','prayerTopics','Chủ đề cầu nguyện',false),
('vi','prayers','prayerWatch','Phiên canh nguyện',false),
('vi','prayers','choosePrayerDuration','Chọn thời lượng cầu nguyện',false)
on conflict (language_code, namespace, key) do nothing;
