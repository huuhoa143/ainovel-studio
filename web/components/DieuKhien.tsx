'use client';

import { useState } from 'react';

import {
  LoiApi,
  choDiTiep,
  chaySach,
  doiCheDoTien,
  dongMay,
  dungSach,
  moMay,
} from '@/lib/api';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import { mayNaoDo } from '@/lib/song';
import type { Snapshot } from '@/lib/types';

/**
 * Điều khiển dây chuyền — Chạy / Dừng / Cho đi tiếp / chế độ nghiệm thu.
 *
 * # Vì sao ở thanh transport chứ không phải trong một bề mặt
 *
 * `PRODUCT.md` chốt điểm neo là bàn transport của DAW, và ở DAW thì transport là chỗ bấm
 * play–stop. Thanh này đã luôn hiện và đã trả lời "dây chuyền còn sống không"; nút bấm
 * thuộc về cùng chỗ với câu trả lời đó. Đặt chúng trong một bề mặt riêng sẽ buộc người
 * vận hành đổi khu để dừng một dây chuyền mà họ đang nhìn thấy đang chạy.
 *
 * # Vì sao đọc chế độ đi tiếp từ snapshot — và câu này TỪNG nói ngược lại
 *
 * Bản trước ghi: *"`Snapshot.transport` không mang `advance_mode`; nó nằm ở `/settings` (đọc
 * `meta/run.json`). Suy nó từ chỗ khác sẽ là bịa."* Cả ba câu đều đúng với tiền đề của
 * chúng, và **tiền đề đã đổi**: kế hoạch 1/4 đưa `advance` vào `/studio`, nên chế độ giờ có
 * mặt trong chính snapshot mà thanh này đã nhận. Vế "suy từ chỗ khác là bịa" vẫn đúng nguyên
 * văn — nó chỉ thôi trỏ vào `/settings`.
 *
 * Giữ nguyên `/settings` sau khi có `advance` mới là chỗ hỏng, và hỏng theo đúng lớp lỗi
 * "hai sự thật" mà quyết định 6 của spec đã tránh khi từ chối tách endpoint riêng cho các
 * trường sống: nút `Cho đi tiếp` ở dải nghiệm thu đọc `snapshot.advance`, còn nhãn chế độ ở
 * đây đọc `/settings`, nên hai chỗ trên CÙNG một màn hình có thể nói khác nhau về cùng một
 * chế độ. Hai endpoint đọc cùng một engine ở hai thời điểm lệch nhau thì có ngày lệch.
 *
 * Và hai nguồn đó không tương đương như vẻ ngoài: `/settings` đọc `meta/run.json` — một TỆP
 * còn lại từ lượt trước — còn `snapshot.advance` đến thẳng từ engine đang mở
 * (`serve.go:325` chỉ gán nó khi `may.dangMo(id)` thành công). Đường mới mất thông tin ở ca
 * engine đóng, và đó là điều ĐÚNG: xem chú thích của `bietCheDo` dưới đây.
 *
 * Không còn lượt đọc mạng nào cho chế độ, nên câu "chỉ đọc một lần khi mở và sau mỗi lượt
 * đổi — không dò liên tục" cũng hết việc: sau một lượt đổi, `onDoi()` nạp lại snapshot theo
 * đúng đường mà mọi lệnh khác trên trang đã dùng.
 */
export function DieuKhien({
  snapshot,
  tacPham,
  choGhi,
  dangChay,
  onDoi,
}: {
  snapshot: Snapshot | undefined;
  tacPham: string | undefined;
  choGhi: boolean | undefined;
  dangChay: boolean;
  /** Gọi sau mỗi lệnh để bề mặt chính nạp lại — trạng thái vừa đổi ở phía engine. */
  onDoi: () => void;
}) {
  const [dangGui, datDangGui] = useState<string | null>(null);
  const [loi, datLoi] = useState<string | null>(null);

  if (!choGhi || !tacPham || !snapshot) return null;

  const goi = (ten: string, fn: () => Promise<unknown>) => {
    datDangGui(ten);
    datLoi(null);
    fn()
      .then(() => onDoi())
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(null));
  };

  const khoa = dangGui !== null;

  /**
   * Engine có đang mở cho cuốn này không — MỘT nguồn duy nhất.
   *
   * `serve.go:325` chỉ gán `advance` khi `may.dangMo(id)` thành công, nên trường này TRẢ LỜI
   * ĐƯỢC câu ấy. Bản trước còn hỏi thêm `/api/engine` trong một `useEffect` và giữ kết quả ở
   * `maMoy` — một nguồn sự thật thứ hai, và chú thích cũ ngay tại đây đã ghi nhận điều đó rồi
   * để lại cho người sau.
   *
   * Hư hại của nguồn thứ hai KHÔNG chỉ là trùng lặp, nó nhìn thấy được: `maMoy` khởi tạo
   * `null` và chỉ có giá trị sau một lượt gọi mạng, mà `null` rơi vào nhánh "engine đang mở".
   * Nên với một cuốn ĐÃ ĐÓNG máy, thanh điều khiển vẽ ra bộ nút của engine đang mở — có cả
   * `Đóng máy` — rồi vài trăm mili-giây sau mới đổi hình thành `[Mở máy][▶ Chạy]`. Đó đúng là
   * cái "khựng" mà người vận hành thấy mỗi lần đổi cuốn.
   *
   * Đọc từ snapshot thì nó đúng ngay từ khung hình đầu tiên, và mỗi lệnh đã tự nạp lại
   * snapshot qua `onDoi` nên không cần ai tự nhớ trạng thái nữa.
   *
   * Kèm theo: chế độ đi tiếp chỉ có nghĩa khi máy mở. In "Tự chạy liên tục" lên một engine đã
   * đóng là khẳng định một điều chưa ai đo, và `PUT /advance-mode` cũng tự đòi
   * `may.dangMo(book)` (`vongdoi.go:41`) nên nút ấy chắc chắn lỗi. Cùng một điều kiện, nên giờ
   * là cùng một biến.
   */
  const mayDangMo = snapshot.advance !== null;
  const choNghiemThu = snapshot.advance?.mode === 'review';

  // Trạng thái engine đã hợp nhất — CÙNG hàm mà thanh transport và `mayDangChay` dùng. Đọc
  // thẳng `snapshot.runtime` ở đây sẽ dựng lại đúng bản-thứ-hai vừa bị gỡ bỏ ở Transport.
  const khoaMay = mayNaoDo(snapshot.runtime, snapshot.book.activity);
  // `paused` = còn một lượt dở đang treo, nên nút nói "Chạy tiếp": bấm là ĐI TIẾP chứ không
  // bắt đầu lại. `idle` (engine mở, rỗng việc) giữ nguyên "Chạy" — gộp hai ca là để một cuốn
  // chưa viết chữ nào mời người dùng "chạy tiếp" từ hư không.
  const nhanChay = khoaMay === 'paused' ? CHU.chayTiep : CHU.chay;
  // `pausing` = lệnh Dừng đã nhận, engine đang thu dọn. Bấm thêm không nhanh hơn, và tệ hơn
  // là một lượt chạy chồng lên một lượt đang tắt.
  const dangThuDon = khoaMay === 'pausing';

  return (
    <div className="dieukhien" role="group" aria-label={CHU.dieuKhien}>
      {loi ? (
        <span className="dkLoi" title={loi}>
          {loi}
        </span>
      ) : null}

      {!mayDangMo ? (
        // Chưa mở máy: CHẠY vẫn là nút hạng nhất, và "Mở máy" hạ xuống hàng phụ.
        //
        // Bản trước chỉ hiện đúng một nút "Mở máy cho tác phẩm này", và đó là một ngõ chết
        // đọc bằng tiếng của người dựng máy: người dùng muốn viết tiếp thì phải học rằng có
        // một bước tên "mở máy" đứng trước. Người dùng nói nguyên văn: "không biết luồng
        // chạy như nào… rời rạc".
        //
        // Điều làm nó thành ngõ chết KHÔNG cần thiết: `boMay.chay` (engine.go:242) tự gọi
        // `mo(id)` trước khi Resume, nên `POST /run` trên một engine đang đóng vẫn chạy
        // được. Bức tường hai bước là do giao diện tự dựng, không do server đòi.
        //
        // "Mở máy" vẫn còn vì lý do nó ra đời: gắn engine KHÔNG gọi model lần nào, nên đó là
        // đường sửa model theo vai mà không tiêu tiền. Nó chỉ thôi làm nút duy nhất.
        // Nút hạng nhất đứng CUỐI, tức sát mép phải — xem `dkChay` ở nhánh dưới.
        <>
          <button
            type="button"
            className="dkNut dkPhu"
            disabled={khoa}
            title={GIAI_THICH.vongDoiCanMoMay}
            onClick={() => goi('mo', () => moMay(tacPham))}
          >
            {dangGui === 'mo' ? CHU.dangGui : CHU.moMay}
          </button>
          <button
            type="button"
            className="dkNut dkChay"
            disabled={khoa}
            title={GIAI_THICH.taoSachSeTieuTien}
            onClick={() => goi('chay', () => chaySach(tacPham))}
          >
            {dangGui === 'chay' ? CHU.dangGui : `▶ ${nhanChay}`}
          </button>
        </>
      ) : (
        <>
          {/* Cho đi tiếp CHỈ có nghĩa ở chế độ nghiệm thu. Ở chế độ tự chạy engine không
              chờ giấy phép nào, nên một nút cấp phép ở đó không làm gì cả. */}
          {choNghiemThu ? (
            <button
              type="button"
              className="dkNut"
              disabled={khoa}
              onClick={() => goi('tiep', () => choDiTiep(tacPham))}
            >
              {dangGui === 'tiep' ? CHU.dangGui : CHU.choDiTiep}
            </button>
          ) : null}

          {/* Nhãn chế độ chỉ hiện khi đo được — xem `bietCheDo`. KHÔNG `datCheDo(r.mode)` sau
              khi đổi: `SetAdvanceMode` chạm engine THẬT và `snapshot.advance.mode` đọc từ cùng
              `p.eng.Snapshot()` đó, nên `onDoi()` của `goi` đã mang về đúng giá trị mới. Giữ
              một bản thứ hai trong state là dựng lại đúng cái nguồn thứ hai vừa bỏ. */}
          {/* Công tắc HAI TRẠNG THÁI, không phải một nút đổi chữ.
              Bản trước là một nút mà nhãn của nó là TRẠNG THÁI HIỆN TẠI, còn bấm vào thì ra
              trạng thái KHÁC — trong khi hai nút bên cạnh (`Đóng máy`, `Dừng`) lấy HÀNH ĐỘNG
              làm nhãn. Ba nút cạnh nhau, hai luật đặt tên. Người vận hành đọc "Tự chạy liên
              tục" thành "bấm để tự chạy" và hỏi vì sao nút không có tác dụng — nó đang báo
              chế độ đã bật sẵn.
              Hiện cả hai lựa chọn cùng lúc thì không còn chỗ để hiểu nhầm: thấy được cái nào
              đang bật, và bấm là CHỌN chứ không phải đảo. Nhãn nhóm nói ra đây là chế độ,
              vì "tự chạy" và "nghiệm thu" đứng trơ thì không tự nói chúng loại trừ nhau. */}
          {/* Không còn `bietCheDo` ở đây: nhánh này CHÍNH LÀ ca máy đang mở, nên điều kiện cũ
              luôn đúng. Giữ nó lại chỉ để lại một câu hỏi đã được trả lời ở tầng trên. */}
          <div className="dkChon" role="group" aria-label={CHU.cheDoDiTiep}>
              <span className="dkChonDe">{CHU.cheDoDiTiep}</span>
              {(
                [
                  ['auto', CHU.cheDoTuChay, GIAI_THICH.cheDoAutoLaGi],
                  ['review', CHU.cheDoNghiemThu, GIAI_THICH.cheDoReviewLaGi],
                ] as const
              ).map(([che, nhan, viSao]) => {
                const dangBat = che === (choNghiemThu ? 'review' : 'auto');
                return (
                  <button
                    key={che}
                    type="button"
                    className={`dkChonNut${dangBat ? ' dkBat' : ''}`}
                    aria-pressed={dangBat}
                    disabled={khoa || dangBat}
                    title={viSao}
                    onClick={() => goi('chedo', () => doiCheDoTien(tacPham, che))}
                  >
                    {dangGui === 'chedo' && !dangBat ? CHU.dangGui : nhan}
                  </button>
                );
            })}
          </div>

          {/* Đóng máy nhả khóa tệp và nhả suất engine cho cuốn khác. Không có nó thì mở
              cuốn A rồi không bao giờ mở được cuốn B mà không tắt cả studio. */}
          <button
            type="button"
            className="dkNut dkPhu"
            disabled={khoa || dangChay}
            title={dangChay ? GIAI_THICH.vongDoiCanMoMay : undefined}
            onClick={() => goi('dong', () => dongMay(tacPham))}
          >
            {dangGui === 'dong' ? CHU.dangGui : CHU.dongMay}
          </button>

          {/* Ô NEO của nút hạng nhất — CUỐI cụm, tức sát mép phải.
              Chạy và Dừng loại trừ nhau theo trạng thái thật, không phải hai nút luôn hiện:
              một nút Dừng bấm được khi không có gì chạy là một nút nói dối. Vì loại trừ nhau
              nên chúng dùng chung MỘT ô, và ô đó là chỗ cố định duy nhất của cả thanh.

              Đứng cuối chứ không đứng đầu, và đây là một lỗi ĐO ĐƯỢC: ghim cả cụm nút vào mép
              phải vẫn để nút Chạy dịch 107px khi bộ nút đổi từ 3 sang 4, vì mỗi nút phụ thêm
              vào lại đẩy nó sang trái. Ghim cụm là chưa đủ; phải ghim đúng cái nút ấy — đúng
              như bàn transport của DAW, nơi play–stop là một chỗ không bao giờ đổi. */}
          {dangChay ? (
            <button
              type="button"
              className="dkNut dkDung"
              disabled={khoa || dangThuDon}
              title={dangThuDon ? GIAI_THICH.dangThuDon : undefined}
              onClick={() => goi('dung', () => dungSach(tacPham))}
            >
              {dangGui === 'dung' ? CHU.dangGui : `‖ ${CHU.dung}`}
            </button>
          ) : (
            <button
              type="button"
              className="dkNut dkChay"
              disabled={khoa || dangThuDon}
              title={dangThuDon ? GIAI_THICH.dangThuDon : GIAI_THICH.taoSachSeTieuTien}
              onClick={() => goi('chay', () => chaySach(tacPham))}
            >
              {dangGui === 'chay' ? CHU.dangGui : `▶ ${nhanChay}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
