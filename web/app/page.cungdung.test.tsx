import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

import { snap, tongGia } from '@/components/mau.test-helper';
import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import type { Khu as KhuMa } from '@/lib/khu';
import type { DapCungDung } from '@/lib/types';
import { BO_DEM_RONG } from '@/lib/vanSong';

import { Khu } from './page';

/**
 * Chế độ cùng dựng đi theo KHU, không theo việc đang chọn cuốn nào.
 *
 * Bản trước suy `giai-doan` từ `tacPham`, nên "Bàn ý tưởng" — mở từ các lối truyện MỚI — tạm
 * dừng cuốn đang chọn rồi đem bản nháp sang biểu mẫu tạo truyện, và cuốn đó nằm dừng mãi.
 * Tệp riêng vì nó thay `@/lib/api` cho cả tệp.
 */

const MO_SACH = vi.fn<(h: unknown[]) => Promise<DapCungDung>>();
const GIAI_DOAN = vi.fn<(b: string, h: unknown[]) => Promise<DapCungDung>>();
const CHOT = vi.fn<(b: string, a: string) => Promise<{ applied: boolean }>>();

vi.mock('@/lib/api', async (goc) => ({
  ...(await goc<typeof import('@/lib/api')>()),
  cungDungMoSach: (h: unknown[]) => MO_SACH(h),
  cungDungGiaiDoan: (b: string, h: unknown[]) => GIAI_DOAN(b, h),
  chotCungDung: (b: string, a: string) => CHOT(b, a),
  huyCungDungGiaiDoan: () => Promise.resolve({}),
}));

const DAP: DapCungDung = { message: 'Ổn.', raw: 'Ổn.', draft: 'Bản hướng đi.', ready: true };

beforeEach(() => {
  for (const f of [MO_SACH, GIAI_DOAN, CHOT]) f.mockReset();
  MO_SACH.mockResolvedValue(DAP);
  GIAI_DOAN.mockResolvedValue(DAP);
  CHOT.mockResolvedValue({ applied: true });
});

function ve(khu: KhuMa, p: Partial<Parameters<typeof Khu>[0]> = {}) {
  return render(
    <Khu
      khu={khu}
      snapshot={snap({ agents: [], idle_agents: [] })}
      sach={[snap({}).book]}
      tong={tongGia()}
      tacPham="b"
      vuaChot={new Set<number>()}
      chuongChon={undefined}
      onChonChuong={() => {}}
      onChonKhu={() => {}}
      onDocChuong={() => {}}
      onChonTacPham={() => {}}
      onMoTacPham={() => {}}
      onXoaXong={() => {}}
      onXongTaoSach={() => {}}
      onChotCungDung={() => {}}
      onDoiCauHinh={() => {}}
      onDoi={() => {}}
      nhapSan=""
      suKien={[]}
      song={undefined}
      vanSong={BO_DEM_RONG}
      dangChay={false}
      {...p}
    />,
  );
}

function gui() {
  fireEvent.change(screen.getByRole('textbox', { name: T.cdNhap }), { target: { value: 'ý của tôi' } });
  fireEvent.click(screen.getByRole('button', { name: /^Gửi/ }));
}

test('"Bàn ý tưởng" là cho truyện MỚI dù đang chọn một cuốn — không đụng tới cuốn đó', async () => {
  const onChotCungDung = vi.fn();
  ve('cung-dung', { onChotCungDung });
  gui();
  await waitFor(() => expect(MO_SACH).toHaveBeenCalled());
  expect(GIAI_DOAN).not.toHaveBeenCalled();

  fireEvent.click(await screen.findByRole('button', { name: /Chốt và viết theo bản này/ }));
  expect(onChotCungDung).toHaveBeenCalledWith('Bản hướng đi.');
  expect(CHOT).not.toHaveBeenCalled();
});

test('"Bàn hướng tiếp theo" là cùng dựng giai đoạn của cuốn đang mở, áp dụng vào chính cuốn đó', async () => {
  const onChonKhu = vi.fn();
  ve('ban-huong', { onChonKhu });
  gui();
  await waitFor(() => expect(GIAI_DOAN).toHaveBeenCalledWith('b', expect.anything()));
  expect(MO_SACH).not.toHaveBeenCalled();

  fireEvent.click(await screen.findByRole('button', { name: T.cdApDung }));
  await waitFor(() => expect(onChonKhu).toHaveBeenCalledWith('dong-san-xuat'));
  expect(CHOT).toHaveBeenCalledWith('b', 'Bản hướng đi.');
});
