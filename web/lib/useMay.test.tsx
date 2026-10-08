import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

const LAY_CAU_HINH = vi.fn<() => Promise<{ needs_setup: boolean }>>();

vi.mock('./api', () => ({
  LA_MOCK: false,
  layCauHinh: () => LAY_CAU_HINH(),
}));

const { useMay } = await import('./useMay');

beforeEach(() => LAY_CAU_HINH.mockReset());

/**
 * ĐO ĐƯỢC trên một máy sạch (HOME rỗng, cổng 8421): mở studio → "Cài đặt lần đầu" → lưu nhà
 * cung cấp qua đúng API mà biểu mẫu dùng → server trả `saved: true` và `/api/config` đổi sang
 * `needs_setup: false` → **trang vẫn kẹt ở "Cài đặt lần đầu" sau 5 giây**, không có rail.
 * F5 mới mở ra.
 *
 * Đây là instance NẶNG NHẤT của lớp lỗi "nạp một lần rồi thôi", vì `page.tsx` chặn TOÀN BỘ
 * studio sau `may.canCaiDat` — người dùng mới nhập khóa xong không đi tiếp được, và không có
 * gì trên màn hình nói cho họ biết phải tải lại trang.
 */
test('hỏi lại được sau khi cấu hình đổi — không cần tải lại trang', async () => {
  LAY_CAU_HINH.mockResolvedValue({ needs_setup: true });
  const r = renderHook(() => useMay());
  await waitFor(() => expect(r.result.current.daHoi).toBe(true));
  expect(r.result.current.canCaiDat).toBe(true);

  // Người dùng vừa lưu khóa API. Server không còn cần cài đặt nữa.
  LAY_CAU_HINH.mockResolvedValue({ needs_setup: false });
  await act(async () => {
    r.result.current.hoiLai();
  });

  await waitFor(() => expect(r.result.current.canCaiDat).toBe(false));
});

test('hỏi lại KHÔNG xoá câu trả lời cũ trong lúc chờ', async () => {
  // Nếu `hoiLai` đặt lại `daHoi` về false thì `page.tsx` sẽ nháy qua màn "đang hỏi" mỗi lần
  // người dùng lưu một thay đổi cấu hình — một bề mặt tự chớp dưới tay người đang dùng.
  LAY_CAU_HINH.mockResolvedValue({ needs_setup: false });
  const r = renderHook(() => useMay());
  await waitFor(() => expect(r.result.current.daHoi).toBe(true));

  let go: (v: { needs_setup: boolean }) => void = () => {};
  LAY_CAU_HINH.mockReturnValue(new Promise((res) => (go = res)));
  act(() => r.result.current.hoiLai());
  expect(r.result.current.daHoi).toBe(true);

  await act(async () => {
    go({ needs_setup: false });
  });
});
