'use client';

import { useCallback, useEffect, useState } from 'react';

/** Giao diện: theo hệ điều hành, hoặc người dùng ghim sáng/tối. */
export type GiaoDien = 'he-thong' | 'light' | 'dark';

const KHOA = 'ainovel.giaoDien';

function apDung(g: GiaoDien) {
  const el = document.documentElement;
  if (g === 'he-thong') delete el.dataset.theme;
  else el.dataset.theme = g;
}

/** Đang hiện sáng hay tối thật sự — để biểu tượng nút nói đúng trạng thái. */
function dangToi(g: GiaoDien): boolean {
  if (g === 'dark') return true;
  if (g === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function useGiaoDien() {
  const [g, datG] = useState<GiaoDien>('he-thong');
  const [toi, datToi] = useState(true);

  useEffect(() => {
    let luu: GiaoDien = 'he-thong';
    try {
      const v = localStorage.getItem(KHOA);
      if (v === 'light' || v === 'dark') luu = v;
    } catch {
      /* chế độ riêng tư chặn localStorage: theo hệ điều hành */
    }
    // Đặt lại sau hydrate: React dựng lại thuộc tính của <html> theo bản HTML tĩnh, nên giá
    // trị kịch bản đầu trang đã đặt có thể bị xóa.
    apDung(luu);
    datG(luu);
    datToi(dangToi(luu));
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const doi = () => datToi(dangToi(luuHienTai()));
    mq?.addEventListener?.('change', doi);
    return () => mq?.removeEventListener?.('change', doi);
  }, []);

  /** Bấm là đảo sang giao diện đối diện với cái đang thấy, rồi ghim lại. */
  const dao = useCallback(() => {
    const moi: GiaoDien = dangToi(luuHienTai()) ? 'light' : 'dark';
    try {
      localStorage.setItem(KHOA, moi);
    } catch {
      /* bỏ qua */
    }
    apDung(moi);
    datG(moi);
    datToi(moi === 'dark');
  }, []);

  return { giaoDien: g, toi, dao };
}

function luuHienTai(): GiaoDien {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'he-thong';
}
