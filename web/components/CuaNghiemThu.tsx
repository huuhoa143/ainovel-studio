'use client';

import { useState } from 'react';

import { LoiApi, canThiep, choDiTiep } from '@/lib/api';
import { trangThaiCua } from '@/lib/nghiemThu';
import { CHU, GIAI_THICH, kyTheoTone } from '@/lib/nhan';
import type { TienDo } from '@/lib/types';

/** Việc đang gửi. `null` = rảnh — đây là cái khóa chống bấm đôi. */
type DangGui = 'tiep' | 'tra' | null;

/**
 * Dải quyết định của cửa nghiệm thu — engine đang đứng ở biên chương, chờ người duyệt.
 *
 * # Vì sao KHÔNG dùng modal
 *
 * Modal chỉ dành cho `ask_user`, và lúc đó engine chặn THẬT: nó không tiến thêm bước nào
 * cho tới khi có câu trả lời, nên chặn màn hình lại là nói đúng sự thật (xem `HoiChan`).
 * Ở cửa nghiệm thu engine cũng đứng chờ, nhưng người dùng vẫn cần đọc bản thảo, xem chi
 * phí, đối chiếu chương trước — chặn họ lại là chặn đúng việc họ phải làm để quyết định.
 * Nên đây là một DẢI, và nó nằm cùng chỗ với bằng chứng chứ không đè lên bằng chứng.
 *
 * # Vì sao MỘT component cho hai bề mặt
 *
 * Dải này vẽ ở đầu buồng lái và ở bề mặt Kiểm định. Hai bản chép tay của cùng một quyết
 * định sẽ trôi lệch nhau ngay lần đổi đầu tiên, và lúc đó hai chỗ trên CÙNG một ứng dụng
 * nói khác nhau về cùng một cửa. Người gọi chỉ truyền `snapshot.advance` — không truyền
 * `dangCho` đã tính sẵn — để luật "cửa nào là cửa đang chờ" chỉ có MỘT chỗ giữ
 * (`lib/nghiemThu.ts`), và người nối dây không có cơ hội tính sai nó.
 *
 * # Hai nút, hai hệ quả, và một cái khóa
 *
 * `Cho đi tiếp` gọi `POST /advance`; `Trả chương N về viết lại` mở một ô nhập rồi gọi
 * `POST /steer` (quyết định 7 — một route riêng là đưa quyết định phạm vi ảnh hưởng vào
 * `serve`, tức nhân bản logic Arbiter mà `PRODUCT.md` cấm).
 *
 * Cả hai đều TIÊU TIỀN, nên `dangGui` khóa cả dải trong lúc gửi: bấm đôi ở đây là hai lượt
 * chạy, tức trả tiền hai lần — cùng lớp rủi ro đã khiến màn Xưởng bị cấm có nút chạy.
 * Một cờ cho CẢ HAI nút chứ không phải mỗi nút một cờ: hai lệnh này loại trừ nhau về ý
 * định, và cho đi tiếp trong lúc câu trả-về đang bay là một trạng thái không ai đọc được.
 *
 * # Vì sao hai nút cùng khóa theo `choGhi`
 *
 * Cả hai đều là đường GHI, và cả nhóm route ghi không được mắc vào mux khi studio lắng
 * nghe ngoài loopback. Vẽ nút bấm được rồi gửi vào hư không là lỗi tệ nhất ở đây — cùng lý
 * lẽ đã ghi trong `OCanThiep.tsx`.
 *
 * `choGhi === undefined` (đang hỏi `/api/config`) khóa nút nhưng KHÔNG hiện câu giải
 * thích: "studio đang ở chế độ chỉ đọc" lúc đó là một khẳng định chưa ai đo được — cùng
 * lớp `null` khác `false` mà cả hợp đồng `/studio` giữ.
 */
export function CuaNghiemThu({
  advance,
  runtime,
  tacPham,
  choGhi,
  dangChay,
  onDoi,
}: {
  advance: TienDo | null;
  /**
   * Trạng thái engine tự khẳng định (`paused`/`running`/…). Cần nó vì cửa nghiệm thu ở luồng
   * THƯỜNG chặn bằng cách để engine DỪNG, không bằng `advance.hold` — xem `trangThaiCua`.
   */
  runtime: string | null;
  tacPham: string | undefined;
  /** undefined = chưa biết (đang hỏi `/api/config`) — xem `useMay`. */
  choGhi: boolean | undefined;
  /**
   * Engine có đang viết dở không — quyết định NHÃN của nút gửi, không quyết định gì khác.
   *
   * Kế hoạch 4/4 (quyết định 7) nói ở cửa nghiệm thu engine "đang đứng" nên server luôn
   * chọn `Continue`. Điều đó không chắc: `AdvanceHold` là một ý định tạm dừng được đặt
   * TRƯỚC và chỉ được tiêu ở biên chương kế tiếp (`internal/host/imp/runner.go:729`), nên
   * cửa có thể đang treo trong lúc engine vẫn viết dở. Server tự chọn `Steer` hay
   * `Continue` theo trạng thái thật; nhãn ở đây đi theo cùng sự thật đó thay vì theo một
   * giả định, vì hai việc khác nhau về hệ quả — một cái tiêm vào lượt đang chạy, một cái
   * bắt đầu một lượt mới và tiêu tiền.
   */
  dangChay: boolean;
  /** Gọi sau mỗi lệnh để snapshot được nạp lại — đừng tự đoán trạng thái mới. */
  onDoi: () => void;
}) {
  const cua = trangThaiCua(advance, runtime);
  const [moO, datMoO] = useState(false);
  const [chu, datChu] = useState('');
  const [dangGui, datDangGui] = useState<DangGui>(null);
  const [loi, datLoi] = useState<string | null>(null);

  // Không chờ thì KHÔNG vẽ gì. Một dải màu rỗng nằm thường trực trên đầu buồng lái dạy
  // người vận hành bỏ qua màu amber, và lần nó nói thật thì họ cũng bỏ qua.
  if (!cua.dangCho) return null;

  const batDuoc = choGhi === true && !!tacPham;
  const khoa = !batDuoc || dangGui !== null;

  const goi = (viec: Exclude<DangGui, null>, fn: () => Promise<unknown>) => {
    if (!tacPham) return;
    datDangGui(viec);
    datLoi(null);
    fn()
      .then(() => {
        // Đóng ô nhập và xóa chữ CHỈ khi đã gửi được. Ở nhánh lỗi thì giữ nguyên: người
        // vận hành vừa mất câu vừa gõ vừa không biết vì sao là hai thiệt hại chồng nhau.
        datMoO(false);
        datChu('');
        onDoi();
      })
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(null));
  };

  return (
    <section className="cuanghiemthu" aria-label={CHU.cuaNghiemThuVung}>
      <p className="cnthead">
        {/* Ký hiệu hình học đứng trước chữ để ảnh đen trắng và người mù màu vẫn phân biệt
            được — khuôn của `TrangThai.tsx`. Lấy từ `kyTheoTone` chứ không viết cứng: dải
            này là tông violet ("chờ duyệt" của hệ giao diện 2, cùng màu với vạch `gate` trên
            trục), và ngày bảng ký hiệu đổi thì nó phải đi theo cùng bảng mà bản duyệt của
            Editor đang dùng, vì hai thứ đứng cạnh nhau ở bề mặt Kiểm định. */}
        <span className="ky" aria-hidden="true">
          {kyTheoTone('violet')}
        </span>
        {CHU.dangChoNghiemThu(cua.chuong)}
      </p>

      <p className="cntlydo">
        {cua.lyDo ? (
          <>
            <span className="lbl">{CHU.ketLuanEditor}:</span> {cua.lyDo}
          </>
        ) : (
          GIAI_THICH.nghiemThuChuaCoKetLuan
        )}
      </p>

      <div className="cntnut">
        <button
          type="button"
          className="nutChinh"
          aria-busy={dangGui === 'tiep' || undefined}
          disabled={khoa}
          onClick={() => goi('tiep', () => choDiTiep(tacPham!))}
        >
          {dangGui === 'tiep' ? CHU.dangGui : CHU.choDiTiep}
        </button>
        <button
          type="button"
          className="nutPhu"
          disabled={khoa}
          onClick={() => {
            // Mang sẵn NGUYÊN VĂN kết luận của Editor để người vận hành SỬA chứ không phải
            // gõ lại: câu đi tới engine nên là câu Editor đã viết, không phải một bản tóm
            // tắt của người đang vội. Vắng kết luận thì ô để TRỐNG — không bịa.
            datChu(cua.lyDo ?? '');
            datMoO(true);
          }}
        >
          {CHU.traChuongVeVietLai(cua.chuong)}
        </button>
      </div>

      {moO ? (
        <div className="cntO">
          <div className="steerbox">
            <input
              type="text"
              aria-label={CHU.traChuongVeVietLai(cua.chuong)}
              aria-describedby="vi-sao-tra-ve"
              value={chu}
              onChange={(e) => datChu(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!khoa && chu.trim()) goi('tra', () => canThiep(tacPham!, chu.trim()));
                }
              }}
              disabled={khoa}
            />
            <button
              type="button"
              aria-busy={dangGui === 'tra' || undefined}
              disabled={khoa || !chu.trim()}
              onClick={() => goi('tra', () => canThiep(tacPham!, chu.trim()))}
            >
              {dangGui === 'tra'
                ? CHU.dangGui
                : dangChay
                  ? CHU.tiemVaoLuotDangChay
                  : CHU.danhThucLuotMoi}
            </button>
            <button type="button" className="nutPhu" onClick={() => datMoO(false)}>
              {CHU.huy}
            </button>
          </div>
          <p className="steerhint" id="vi-sao-tra-ve">
            {GIAI_THICH.traVeVietLaiQuaSteer}
          </p>
        </div>
      ) : null}

      {/* Lỗi nguyên văn, KHÔNG kẹp dòng: câu của server biết rõ hơn giao diện chuyện gì đã
          xảy ra — 409 ở đây có thể là "engine đã đóng", "chương đã được cấp phép rồi" hay
          "auto còn sót giấy phép", ba việc phải xử khác nhau. */}
      {loi ? <p className="loiDoc">{loi}</p> : null}

      {choGhi === false ? (
        <p className="steerhint">
          <strong>{GIAI_THICH.nghiemThuChoDay}.</strong> {GIAI_THICH.canThiepTat}
        </p>
      ) : null}
    </section>
  );
}
