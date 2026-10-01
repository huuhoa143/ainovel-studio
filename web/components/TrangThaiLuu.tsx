'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { LoiApi } from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';

/**
 * Trạng thái của MỘT thao tác ghi: đang lưu → đã lưu → (tắt dần), hoặc lỗi kèm lý do.
 *
 * Mỗi điều khiển ghi trên màn Model & khóa API giữ một bộ của riêng nó. Bản trước có chỗ lưu
 * xong không nói gì ("bấm rồi mà không thấy gì xảy ra"), có chỗ nuốt lỗi; một hook chung là
 * một luật cho mọi nút.
 */
export type TrangThai = { loai: 'nghi' } | { loai: 'dang' } | { loai: 'xong' } | { loai: 'loi'; loi: string };

export function useTrangThaiLuu() {
  const [tt, datTt] = useState<TrangThai>({ loai: 'nghi' });
  const hen = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hen.current) clearTimeout(hen.current);
  }, []);

  const chay = useCallback(<T,>(viec: () => Promise<T>, sauKhi?: (kq: T) => void) => {
    if (hen.current) clearTimeout(hen.current);
    datTt({ loai: 'dang' });
    return viec()
      .then((kq) => {
        datTt({ loai: 'xong' });
        hen.current = setTimeout(() => datTt({ loai: 'nghi' }), 2600);
        sauKhi?.(kq);
        return true;
      })
      .catch((e: unknown) => {
        datTt({ loai: 'loi', loi: e instanceof LoiApi || e instanceof Error ? e.message : String(e) });
        return false;
      });
  }, []);

  const xoaLoi = useCallback(() => datTt({ loai: 'nghi' }), []);
  return { tt, chay, xoaLoi, dang: tt.loai === 'dang' };
}

/** Dòng trạng thái đứng cạnh nút vừa bấm. `nghi` thì không chiếm chỗ. */
export function TrangThaiLuu({ tt, nhanXong = CH.daLuu }: { tt: TrangThai; nhanXong?: string }) {
  if (tt.loai === 'dang') {
    return (
      <span className="chTT dang" role="status">
        {CH.dangLuu}
      </span>
    );
  }
  if (tt.loai === 'xong') {
    return (
      <span className="chTT xong" role="status">
        <span aria-hidden="true">✓ </span>
        {nhanXong}
      </span>
    );
  }
  if (tt.loai === 'loi') {
    return (
      <span className="chTT loi" role="alert">
        {tt.loi}
      </span>
    );
  }
  return null;
}
