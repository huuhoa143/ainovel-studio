'use client';

import { useCallback, useEffect, useState } from 'react';

import { LA_MOCK, layCauHinh } from './api';

/**
 * Máy này có cần cài lần đầu không.
 *
 * # Vì sao lỗi KHÔNG bị coi là cần cài
 *
 * Mạng đứt hay server 500 không kết luận gì về cấu hình. Coi chúng là "chưa cài" sẽ đẩy
 * người dùng đã có khóa vào màn cài đặt vì một lần đọc hỏng.
 */
export interface TinhTrangMay {
  /** true = chưa có tệp cấu hình nào; studio không làm được gì tới khi có khóa. */
  canCaiDat: boolean;
  daHoi: boolean;
  /**
   * Hỏi lại `/api/config`. Gọi sau khi người dùng LƯU một thay đổi cấu hình.
   *
   * # Vì sao bắt buộc phải có
   *
   * `page.tsx` chặn TOÀN BỘ studio sau `canCaiDat`. Không có đường hỏi lại thì người dùng
   * mới nhập khóa API xong vẫn kẹt ở màn "Cài đặt lần đầu" — và không gì trên màn hình nói
   * cho họ biết phải tải lại trang.
   *
   * ĐO ĐƯỢC trên một máy sạch (HOME rỗng): lưu nhà cung cấp qua đúng API mà biểu mẫu dùng,
   * server trả `saved: true` và `/api/config` đổi sang `needs_setup: false`, mà trang vẫn là
   * "Cài đặt lần đầu" sau 5 giây. F5 mới mở ra.
   *
   * `hoiLai` KHÔNG đặt `daHoi` về false: làm thế thì bề mặt nháy qua trạng thái "đang hỏi"
   * mỗi lần lưu, tức tự chớp dưới tay người đang dùng. Câu trả lời cũ còn dùng được cho tới
   * khi có câu mới.
   */
  hoiLai: () => void;
}

export function useMay(): TinhTrangMay {
  const [tt, datTt] = useState({
    canCaiDat: false,
    daHoi: false,
  });
  /** Bơm để chạy lại phép hỏi. Một con số, vì nội dung câu hỏi không đổi. */
  const [lanHoi, datLanHoi] = useState(0);
  const hoiLai = useCallback(() => datLanHoi((n) => n + 1), []);

  useEffect(() => {
    if (LA_MOCK) {
      datTt({ canCaiDat: false, daHoi: true });
      return;
    }
    let huy = false;
    layCauHinh()
      .then((d) => {
        if (!huy) datTt({ canCaiDat: d.needs_setup, daHoi: true });
      })
      .catch(() => {
        if (!huy) datTt({ canCaiDat: false, daHoi: true });
      });
    return () => {
      huy = true;
    };
  }, [lanHoi]);

  return { ...tt, hoiLai };
}
