-- supabase/migrations/0038_seed_ui_translations_vi_devlibrary.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for DevotionalLibrary chrome
-- (toasts + share dialog, namespace 'devotionals'). {day} placeholders are kept
-- verbatim for interpolation. reviewed=false; ON CONFLICT DO NOTHING.

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','devotionals','failedLoadDevotionals','Không thể tải các bài tĩnh nguyện',false),
('vi','devotionals','seriesNotFound','Không tìm thấy loạt bài',false),
('vi','devotionals','seriesNotFoundDesc','Không thể tải loạt bài tĩnh nguyện này.',false),
('vi','devotionals','contentErrorTitle','Lỗi nội dung',false),
('vi','devotionals','contentErrorDesc','Không thể tải nội dung tĩnh nguyện.',false),
('vi','devotionals','noContentAvailable','Chưa có nội dung',false),
('vi','devotionals','noContentAvailableDesc','Loạt bài tĩnh nguyện này chưa có nội dung.',false),
('vi','devotionals','progressSaved','Đã lưu tiến độ',false),
('vi','devotionals','failedSaveProgress','Không thể lưu tiến độ',false),
('vi','devotionals','seriesCompleteExcl','Hoàn thành loạt bài!',false),
('vi','devotionals','seriesCompleteExclDesc','Bạn đã hoàn thành loạt bài tĩnh nguyện này!',false),
('vi','devotionals','couldNotLoadNextDay','Không thể tải ngày tiếp theo',false),
('vi','devotionals','contentNotAvailable','Nội dung không khả dụng',false),
('vi','devotionals','dayNotAvailableYet','Ngày {day} chưa khả dụng.',false),
('vi','devotionals','couldNotLoadPrevDay','Không thể tải ngày trước đó',false),
('vi','devotionals','dayNotAvailable','Ngày {day} không khả dụng.',false),
('vi','devotionals','pleaseSignInBookmark','Vui lòng đăng nhập để lưu dấu trang',false),
('vi','devotionals','removedTitle','Đã xóa',false),
('vi','devotionals','bookmarkRemoved','Đã xóa dấu trang',false),
('vi','devotionals','savedTitle','Đã lưu',false),
('vi','devotionals','addedToBookmarks','Đã thêm vào dấu trang',false),
('vi','devotionals','failedUpdateBookmark','Không thể cập nhật dấu trang',false),
('vi','devotionals','enterEmailAddress','Vui lòng nhập địa chỉ email',false),
('vi','devotionals','sharedExcl','Đã chia sẻ!',false),
('vi','devotionals','devotionalSharedSuccess','Đã chia sẻ bài tĩnh nguyện thành công',false),
('vi','devotionals','failedShareDevotional','Không thể chia sẻ bài tĩnh nguyện',false),
('vi','devotionals','devotionalCompleteExcl','Hoàn thành bài tĩnh nguyện!',false),
('vi','devotionals','progressBeenSaved','Tiến độ của bạn đã được lưu.',false),
('vi','devotionals','shareThisDevotional','Chia sẻ bài tĩnh nguyện này',false),
('vi','devotionals','emailAddress','Địa chỉ email',false),
('vi','devotionals','personalMessageOptional','Lời nhắn cá nhân (Tùy chọn)',false),
('vi','devotionals','addPersonalNote','Thêm lời nhắn cá nhân...',false)
on conflict (language_code, namespace, key) do nothing;
