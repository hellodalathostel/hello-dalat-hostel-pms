
-- Xóa toàn bộ data staging cũ (61 pending + 24 conflict) sau khi quyết định bỏ chiều
-- OTA → PMS import. Data này không còn ý nghĩa review vì sẽ không có cập nhật mới.
delete from ota_calendar_feed;
