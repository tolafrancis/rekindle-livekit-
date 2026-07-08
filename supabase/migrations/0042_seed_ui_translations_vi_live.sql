-- supabase/migrations/0042_seed_ui_translations_vi_live.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for LiveChannels chrome
-- (toasts + search/category + create-channel form + help panels, namespace
-- 'live'). {name} placeholders kept. reviewed=false; ON CONFLICT DO NOTHING.
-- The 3 <b>-rich broadcast <li> help lines are deferred (rich-text).

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','live','invalidFile','Tệp không hợp lệ',false),
('vi','live','uploadImageFile','Vui lòng tải lên một tệp hình ảnh',false),
('vi','live','logoUploaded','Đã tải lên logo',false),
('vi','live','logoUploadedDesc','Đã tải lên logo kênh thành công',false),
('vi','live','uploadFailed','Tải lên thất bại',false),
('vi','live','failedUploadLogo','Không thể tải lên logo',false),
('vi','live','imageUploaded','Đã tải lên hình ảnh',false),
('vi','live','imageUploadedDesc','Đã tải lên hình ảnh nổi bật thành công',false),
('vi','live','failedUploadImage','Không thể tải lên hình ảnh nổi bật',false),
('vi','live','failedLoadChannels','Không thể tải các kênh',false),
('vi','live','openingMeeting','Đang mở cuộc họp',false),
('vi','live','loadingMeeting','Đang tải cuộc họp tương tác...',false),
('vi','live','channelNotFound','Không tìm thấy kênh',false),
('vi','live','channelNotFoundDesc','Không thể tìm thấy kênh cho cuộc họp này',false),
('vi','live','validationError','Lỗi xác thực',false),
('vi','live','provideChannelName','Vui lòng cung cấp tên kênh',false),
('vi','live','channelCreated','Đã tạo kênh',false),
('vi','live','channelReadyLive','{name} đã sẵn sàng để phát trực tiếp!',false),
('vi','live','errorCreatingChannel','Lỗi khi tạo kênh',false),
('vi','live','signInFollow','Vui lòng đăng nhập để theo dõi các kênh',false),
('vi','live','unfollowed','Đã bỏ theo dõi',false),
('vi','live','unfollowedDesc','Bạn đã bỏ theo dõi {name}',false),
('vi','live','following','Đang theo dõi',false),
('vi','live','followingDesc','Bạn sẽ được thông báo khi {name} phát trực tiếp',false),
('vi','live','searchChannels','Tìm kênh...',false),
('vi','live','allCategories','Tất cả danh mục',false),
('vi','live','category','Danh mục',false),
('vi','live','channelNamePlaceholder','Kênh Cầu nguyện của tôi',false),
('vi','live','channelAboutPlaceholder','Kênh của bạn nói về điều gì?',false),
('vi','live','channelName','Tên kênh',false),
('vi','live','channelNameRequired','Tên kênh là bắt buộc',false),
('vi','live','descriptionOptional','Mô tả (Tùy chọn)',false),
('vi','live','channelLogoOptional','Logo kênh (Tùy chọn)',false),
('vi','live','whatIsBroadcast','Thiết lập phát sóng là gì?',false),
('vi','live','broadcastIntro','Mở nó để thiết lập mọi thứ cho kênh này trước khi bạn phát trực tiếp:',false),
('vi','live','premiumFeature','Tính năng Premium+',false),
('vi','live','interactiveMeetingsDesc','Cuộc họp tương tác cho phép bạn tổ chức các buổi video trực tiếp cho những người theo dõi kênh của bạn.',false),
('vi','live','selectChannelBelow','Chọn một kênh bên dưới để quản lý các cuộc họp của kênh đó.',false)
on conflict (language_code, namespace, key) do nothing;
