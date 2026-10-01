'use client';

import { soTu, thoiLuong } from '@/lib/dinhdang';
import { CHU, GIAI_THICH, TRANG_THAI_CHUONG, nhanToVai } from '@/lib/nhan';
import type { Capabilities, ChapterRow } from '@/lib/types';

import { TrangThai } from './TrangThai';

/**
 * Bảng chương — nơi làm việc thật. Số liệu canh phải, chữ số tabular; tên chương serif vì nó
 * là chữ của truyện; trạng thái là viên `.vien` mang cả ký hiệu lẫn chữ.
 *
 * Hai cột trong bản mockup không được vẽ ở đây, và đó là chủ ý:
 *
 *   • **Chi phí** — `capabilities.per_chapter_cost === false`. Store cộng chi
 *     phí theo agent và theo model (domain.UsageState), KHÔNG theo chương, nên
 *     cột đó không có nguồn. Vẽ nó ra rồi điền một con số trông hợp lý là cách
 *     nhanh nhất để người vận hành quyết định sai — họ sẽ so giá chương với
 *     chương. Giá thành trung bình ở thanh dưới thì có nguồn thật.
 *   • **Thời lượng** — vẽ khi `per_chapter_duration === true`, nhưng ô nào
 *     `duration_ms` vắng thì là "—", KHÔNG phải "0s": 0 nghĩa là xong tức thời.
 */
export function BangChuong({
  rows,
  capabilities,
  chuongChon,
  onChon,
  dangChay,
  khiTrong,
}: {
  rows: ChapterRow[];
  capabilities: Capabilities;
  chuongChon: number | undefined;
  onChon: (n: number) => void;
  /**
   * Máy còn đang chạy không. Chỉ dùng để bật nhịp đập của đốm trạng thái, và nó
   * là THAM SỐ chứ không suy từ `rows`: `stage === 'drafting'` là công đoạn đã
   * ghi vào store, nên một chương chết dở giữa lúc soạn cũng mang giá trị đó.
   * Bắt buộc, không optional — bỏ quên nó thì nhịp đập tắt im lặng, và một hàng
   * đang chạy mà không đập là nói dối theo hướng ngược lại.
   */
  dangChay: boolean;
  /**
   * Câu thay thế khi không có hàng nào. Cần vì bảng rỗng có hai nghĩa khác nhau:
   * store chưa có chương nào, hay phép lọc mức xem đã loại hết. Nói sai một
   * trong hai làm người vận hành đi tìm sai chỗ.
   */
  khiTrong?: string;
}) {
  if (rows.length === 0) {
    return <p className="trongSect">{khiTrong ?? GIAI_THICH.chuaCoChuong}</p>;
  }

  const coThoiLuong = capabilities.per_chapter_duration;

  return (
    <div className="bangwrap">
      <table className="bang">
      <thead>
        <tr>
          <th scope="col">{CHU.colChuong}</th>
          <th scope="col">{CHU.colTieuDe}</th>
          <th scope="col">{CHU.colCongDoan}</th>
          <th scope="col" className="who">
            {CHU.colPhuTrach}
          </th>
          <th scope="col" className="num">
            {CHU.colSoTu}
          </th>
          {coThoiLuong ? (
            <th scope="col" className="num">
              {CHU.colThoiLuong}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const tt = TRANG_THAI_CHUONG[r.stage];
          const chon = r.chapter === chuongChon;
          const tu = soTu(r.words);
          const tl = thoiLuong(r.duration_ms);
          const vai = nhanToVai(r.owner);

          return (
            <tr
              key={r.chapter}
              aria-selected={chon}
              tabIndex={0}
              onClick={() => onChon(r.chapter)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChon(r.chapter);
                }
              }}
            >
              <td className="ch">{r.chapter}</td>
              <td className="title">
                {r.title ? r.title : <span className="draft">{CHU.chuaDatTieuDe}</span>}
              </td>
              <td>
                <TrangThai tt={tt} dap={dangChay} vien />
              </td>
              <td className="who">{vai || <span className="trong">{CHU.khongCo}</span>}</td>
              <td className="num">{tu ?? <span className="trong">{CHU.khongCo}</span>}</td>
              {coThoiLuong ? (
                <td className="num">
                  {tl ?? (
                    <span className="trong" title={GIAI_THICH.khongDoDuocThoiLuong}>
                      {CHU.khongCo}
                    </span>
                  )}
                </td>
              ) : null}
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Câu giải thích vì sao không có cột chi phí. Đặt dưới bảng, chỉ hiện khi
 * capability tắt — im lặng bỏ một cột làm người đọc tưởng giao diện thiếu, còn
 * nói ra thì họ biết đó là giới hạn của dữ liệu.
 */
export function GhiChuChiPhi({ capabilities }: { capabilities: Capabilities }) {
  if (capabilities.per_chapter_cost) return null;
  return <p className="steerhint">{GIAI_THICH.khongCoChiPhiTheoChuong}</p>;
}
