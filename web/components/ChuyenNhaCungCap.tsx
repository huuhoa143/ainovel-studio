'use client';

import { useId, useState } from 'react';

import type { SuaCauHinh } from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';
import {
  duKienChuyen,
  khaiThemNeuThieu,
  thanChiDoiMacDinh,
  thanChuyenCaDay,
  type DongChuyen,
} from '@/lib/chuyenNhaCungCap';
import { nhanKenhVai } from '@/lib/nhan';
import type { CauHinhDoc } from '@/lib/types';

import { HopXacNhan } from './HopXacNhan';

/**
 * Hộp "chuyển model mặc định sang nhà cung cấp khác" — bảng đối chiếu trước khi ghi.
 *
 * Chỉ mở khi câu hỏi thật sự có ba đáp án: còn vai CHỌN RIÊNG ở nhà cung cấp khác. Hủy, chỉ đổi
 * mặc định (vai chọn riêng giữ nguyên — đó là cả lý do nó được chọn riêng), hoặc chuyển cả các
 * vai. Không còn vai chọn riêng thì đổi mặc định là một lượt ghi thẳng, và thẻ "Đang dùng" cho
 * thấy ngay mọi vai đổi theo.
 *
 * # Vì sao phải CHO XEM chứ không tự ánh xạ
 *
 * Tên model chỉ có nghĩa bên trong một nhà cung cấp. Sang nơi mới, vai nào có đúng tên thì giữ,
 * vai nào không thì phải chọn lại — tự đoán im lặng là đúng cách đã đẻ ra `openai · cx/gpt-5.5`.
 *
 * # Hai lối ghi, một nguồn
 *
 * Cả "Chỉ đổi mặc định" lẫn "Chuyển cả các vai" lấy model mặc định từ dòng Mặc định CỦA BẢNG.
 * Bản trước cho "Chỉ đổi mặc định" lấy `models[0]` của nhà cung cấp — bỏ qua thứ người dùng
 * vừa sửa, và gửi `model: ""` khi nhà cung cấp chưa khai model nào (đo được: ra `kiraai · auto`).
 */
export function ChuyenNhaCungCap({
  du,
  den,
  goiY,
  cuaSo,
  dangGui,
  loi,
  onChiDoiMacDinh,
  onChuyenCaDay,
  onHuy,
}: {
  du: CauHinhDoc;
  /** Nhà cung cấp đích và model mặc định đã chọn ở đó. */
  den: { provider: string; model: string };
  /** Model của nơi đến (đã lưu + vừa tải) — gợi ý cho từng dòng. */
  goiY?: string[];
  cuaSo?: (model: string) => number;
  dangGui: boolean;
  /** Lỗi của lượt ghi vừa rồi. Hộp ở lại để người dùng đọc và thử tiếp. */
  loi?: string | null;
  /** Vắng mặt = lối "Chỉ đổi mặc định" không có nghĩa ở lối vào này. */
  onChiDoiMacDinh?: (than: SuaCauHinh) => void;
  onChuyenCaDay: (than: SuaCauHinh) => void;
  onHuy: () => void;
}) {
  // Bảng dựng MỘT LẦN lúc mở hộp, rồi người dùng sửa trên đó.
  const [dong, datDong] = useState<DongChuyen[]>(() => duKienChuyen(du, den.provider, den.model, goiY));
  const idDs = useId();
  const dsGoiY = Array.from(new Set(goiY ?? []));
  const thieu = dong.some((d) => !d.denModel.trim());

  /** Khai luôn mọi model mới được chọn trong bảng — server từ chối cặp chưa khai. */
  const kemKhai = (than: SuaCauHinh, models: string[]): SuaCauHinh => {
    const khai = khaiThemNeuThieu(du, den.provider, models, cuaSo);
    return khai ? { ...than, provider_config: khai } : than;
  };
  const macDinh = dong.find((d) => d.vai === 'default')?.denModel ?? '';

  return (
    <HopXacNhan
      moRa
      tieuDe={CH.chuyenTieuDe(den.provider)}
      nhanLam={CH.chuyenCa}
      onLam={() => {
        if (thieu) return;
        onChuyenCaDay(
          kemKhai(
            thanChuyenCaDay(dong, den.provider, du.roles),
            dong.map((d) => d.denModel),
          ),
        );
      }}
      nhanPhu={onChiDoiMacDinh ? CH.chiDoiMacDinh : undefined}
      onPhu={
        onChiDoiMacDinh
          ? () => {
              if (!macDinh.trim()) return;
              onChiDoiMacDinh(kemKhai(thanChiDoiMacDinh(dong, den.provider), [macDinh]));
            }
          : undefined
      }
      onHuy={onHuy}
      dangLam={dangGui}
      nhanDangLam={CH.dangChuyen}
      than={
        <>
          <p>{CH.chuyenThan}</p>
          <table className="bangChuyen">
            <thead>
              <tr>
                <th scope="col">{CH.vai}</th>
                <th scope="col">{CH.dangDungCot}</th>
                <th scope="col">{CH.seThanh}</th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.vai} className={d.giuDuocTen ? undefined : 'phaiChon'}>
                  <th scope="row">
                    {nhanKenhVai(d.vai)}
                    {d.vai !== 'default' ? (
                      <span className="phu"> · {d.dangGhim ? CH.datRieng : CH.theoMacDinh}</span>
                    ) : null}
                  </th>
                  <td className="m">
                    {d.tuProvider} · {d.tuModel}
                  </td>
                  <td className="m">
                    <input
                      aria-label={CH.modelMoiCua(nhanKenhVai(d.vai))}
                      value={d.denModel}
                      list={idDs}
                      onChange={(e) => {
                        const v = e.target.value;
                        datDong((cu) => cu.map((x, j) => (j === i ? { ...x, denModel: v } : x)));
                      }}
                    />
                    {d.giuDuocTen ? null : <span className="mo"> {CH.phaiChonLai}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id={idDs}>
            {dsGoiY.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {thieu ? <p className="loiDoc">{CH.thieuModel}</p> : null}
          {loi ? <p className="loiDoc">{loi}</p> : null}
        </>
      }
    />
  );
}
