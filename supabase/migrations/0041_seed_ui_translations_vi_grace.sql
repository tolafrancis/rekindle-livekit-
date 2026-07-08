-- supabase/migrations/0041_seed_ui_translations_vi_grace.sql
-- Phase 2 (adoption sweep) — Vietnamese drafts for GraceCounselChat chrome
-- (namespace 'grace'). reviewed=false; ON CONFLICT DO NOTHING.
-- Welcome message uses the standard Vietnamese Protestant text of Matthew 11:28.
-- NOTE: the AI's live replies are still generated in English until Phase 5
-- (language is not yet passed to the spiritual-companion edge function).

insert into public.ui_translations (language_code, namespace, key, value, reviewed) values
('vi','grace','initializing','Đang khởi tạo GraceCounsel...',false),
('vi','grace','failedInit','Không thể khởi tạo người bạn đồng hành thuộc linh. Vui lòng làm mới trang.',false),
('vi','grace','failedNewSession','Không thể bắt đầu phiên mới',false),
('vi','grace','failedSend','Không thể gửi tin nhắn. Vui lòng thử lại.',false),
('vi','grace','welcomeMessage','Chào mừng bạn! Tôi là GraceCounsel, người bạn đồng hành thuộc linh AI của bạn, đặt nền trên Lời Đức Chúa Trời. "Hỡi những kẻ mệt mỏi và gánh nặng, hãy đến cùng ta, ta sẽ cho các ngươi được yên nghỉ" (Ma-thi-ơ 11:28). Hôm nay tôi có thể hỗ trợ bạn như thế nào?',false),
('vi','grace','newSession','Phiên mới',false),
('vi','grace','searchConversations','Tìm cuộc trò chuyện…',false),
('vi','grace','noMatch','Không có cuộc trò chuyện nào khớp với tìm kiếm của bạn.',false),
('vi','grace','noConversations','Chưa có cuộc trò chuyện nào.',false),
('vi','grace','conversation','Cuộc trò chuyện',false),
('vi','grace','subtitle','Người bạn đồng hành thuộc linh đặt nền trên Kinh Thánh của bạn',false),
('vi','grace','responding','GraceCounsel đang trả lời...',false),
('vi','grace','inputPlaceholder','Chia sẻ điều đang ở trong lòng bạn...',false),
('vi','grace','sending','Đang gửi',false),
('vi','grace','poweredBy','Được hỗ trợ bởi OpenAI • Mọi cuộc trò chuyện đều riêng tư và bảo mật',false)
on conflict (language_code, namespace, key) do nothing;
