'use client';

import { useEffect, useState } from 'react';

import {
  LoiApi,
  choDiTiep,
  chaySach,
  doiCheDoTien,
  dongMay,
  dungSach,
  moMay,
} from '@/lib/api';
import { DIEU_KHIEN, DONG_PHIEN } from '@/lib/chu/tien-do';
import { CHU, GIAI_THICH } from '@/lib/nhan';
import { trangThaiCua } from '@/lib/nghiemThu';
import { mayNaoDo } from '@/lib/song';
import type { Snapshot } from '@/lib/types';

import { O_GOP_Y } from './OCanThiep';

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
/** Lệnh đang gửi: tên nút, vân tay trạng thái lúc bấm, và server đã nhận lệnh chưa. */
interface Lenh {
  ten: 'mo' | 'chay' | 'dung' | 'dong' | 'tiep' | 'chedo';
  /** Chế độ đích khi `ten === 'chedo'` — nhãn "Đang đổi…" bám đúng nút được bấm. */
  dich?: string;
  dau: string;
  daNhan: boolean;
}

/**
 * Vân tay của những gì một lệnh điều khiển có thể đổi: engine đang ở đâu, phiên có mở không,
 * chế độ đi tiếp, có đang đứng ở cửa duyệt không. Lệnh nào cũng đổi ít nhất một trong số đó.
 */
function vanTay(s: Snapshot | undefined): string {
  if (!s) return '';
  return [
    mayNaoDo(s.runtime, s.book.activity),
    s.advance === null ? 'dong' : 'mo',
    s.advance?.mode ?? '',
    trangThaiCua(s.advance, s.runtime, s.stop).dangCho ? 'cua' : '',
  ].join('|');
}

/** Engine nhận lệnh mà quá lâu trạng thái vẫn đứng yên thì nhả nút — xem `goi`. */
const CHO_DOI_TOI_DA_MS = 20_000;

export function DieuKhien({
  snapshot,
  tacPham,
  dangChay,
  onDoi,
}: {
  snapshot: Snapshot | undefined;
  tacPham: string | undefined;
  dangChay: boolean;
  /** Gọi sau mỗi lệnh để bề mặt chính nạp lại — trạng thái vừa đổi ở phía engine. */
  onDoi: () => void;
}) {
  const [lenh, datLenh] = useState<Lenh | null>(null);
  const [loi, datLoi] = useState<string | null>(null);
  const dau = vanTay(snapshot);

  // Lệnh đã được nhận và trạng thái engine đã đổi khác lúc bấm: lệnh ấy xong việc.
  useEffect(() => {
    if (lenh?.daNhan && dau !== lenh.dau) datLenh(null);
  }, [lenh, dau]);
  // Lưới an toàn: engine nhận lệnh mà trạng thái không đổi (vd. bấm Dừng đúng lúc nó vừa tự
  // dừng) thì nút không được kẹt "Đang…" mãi.
  useEffect(() => {
    if (!lenh?.daNhan) return;
    const t = setTimeout(() => datLenh(null), CHO_DOI_TOI_DA_MS);
    return () => clearTimeout(t);
  }, [lenh]);

  if (!tacPham || !snapshot) return null;

  /**
   * Gửi một lệnh, và giữ nút ở trạng thái "đang làm" cho tới khi ENGINE đổi trạng thái — không
   * phải tới khi HTTP trả lời.
   *
   * Bản trước nhả nút ngay lúc `POST` trả 200, tức vài chục mili-giây: server chỉ nhận lệnh rồi
   * trả, còn engine đổi trạng thái sau đó một hai giây (snapshot nạp lại sau sự kiện kế tiếp).
   * Khoảng giữa nút quay về đúng nhãn cũ — bấm "Tiếp tục viết" xong vẫn thấy "Tiếp tục viết" —
   * nên người dùng bấm lại, và lần bấm thứ hai đâm vào một engine đang dở tay. Đo trên truyện
   * thật: dòng đỏ "Engine đang hoàn tất lần dừng trước" là từ đúng lần bấm thứ hai ấy.
   */
  const goi = (ten: Lenh['ten'], fn: () => Promise<unknown>, dich?: string) => {
    datLenh({ ten, dich, dau, daNhan: false });
    datLoi(null);
    fn()
      .then(() => {
        datLenh((l) => (l && l.ten === ten ? { ...l, daNhan: true } : l));
        onDoi();
      })
      .catch((e: unknown) => {
        datLoi(e instanceof LoiApi ? e.message : String(e));
        datLenh(null);
      });
  };

  // Lệnh chỉ còn hiệu lực khi trạng thái CHƯA đổi so với lúc bấm — tính ngay lúc vẽ, không đợi
  // effect nhả. Đợi effect thì có đúng một khung hình vẽ trạng thái mới cùng nhãn "Đang…" cũ:
  // đo được, "Đang đổi…" nhảy sang nút chế độ bên kia ngay khi chế độ vừa đổi.
  const conHieuLuc = lenh && (!lenh.daNhan || lenh.dau === dau) ? lenh : null;
  const dangGui = conHieuLuc?.ten ?? null;
  const khoa = dangGui !== null;
  const nhanDang = (ten: Lenh['ten'], nhan: string) => (dangGui === ten ? DIEU_KHIEN.dangLam[ten] : nhan);

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
  // Nút "Duyệt, viết chương tiếp" chỉ có nghĩa khi engine THẬT SỰ đứng ở cửa. Hiện nó suốt cả
  // chế độ duyệt — kể cả lúc đang dựng nền, chưa có chương nào để duyệt — là mời bấm một nút
  // không duyệt gì. Cùng phép đo với dải nghiệm thu, để nút và dải không lệch nhau.
  const dangChoDuyet = trangThaiCua(snapshot.advance, snapshot.runtime, snapshot.stop).dangCho;

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
  // Truyện đã đủ số chương dự kiến: viết tiếp không còn là việc chính, nên nút ấy hạ xuống
  // hàng phụ và đổi tên. Một nút vàng "▶ Viết tiếp" trên một truyện đã xong là mời người dùng
  // tiêu tiền cho một việc họ không cần — việc chính lúc này là đọc và xuất bản.
  const daXong = khoaMay === 'completed' || snapshot.book.phase === 'complete';
  const lopChay = daXong ? 'dkNut dkPhu' : 'dkNut dkChay';
  const nhanNutChay = daXong ? DIEU_KHIEN.vietThem : `▶ ${nhanChay}`;
  const viSaoChay = daXong ? DIEU_KHIEN.vietThemGiai : GIAI_THICH.taoSachSeTieuTien;

  // Truyện đã xong: "Viết thêm" không chạy thẳng — viết thêm mà không có hướng thì Kiến trúc sư
  // thấy dàn ý đã đủ và kết truyện lại ngay sau vài giây. Nút đưa con trỏ vào ô góp ý (đã đổi
  // thành "Muốn viết thêm gì?"); câu gửi ở đó mới mở lại truyện. Màn không có ô ấy thì chạy
  // thẳng như cũ — vẫn hơn một nút không làm gì.
  const bamChay = () => {
    const o = daXong ? document.getElementById(O_GOP_Y) : null;
    if (o instanceof HTMLInputElement && !o.disabled) {
      o.scrollIntoView({ block: 'center', behavior: 'smooth' });
      o.focus();
      return;
    }
    goi('chay', () => chaySach(tacPham));
  };

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
          {/* Sách đã xong thì "mở sẵn, chưa viết" không còn gì để mở sẵn: nút có nghĩa duy
              nhất là Viết thêm. Đổi model theo vai vẫn làm được ở màn Model. */}
          {daXong ? null : (
            <button
              type="button"
              className="dkNut dkPhu"
              disabled={khoa}
              title={GIAI_THICH.vongDoiCanMoMay}
              aria-busy={dangGui === 'mo' || undefined}
              onClick={() => goi('mo', () => moMay(tacPham))}
            >
              {nhanDang('mo', CHU.moMay)}
            </button>
          )}
          <button
            type="button"
            className={lopChay}
            disabled={khoa}
            title={viSaoChay}
            aria-busy={dangGui === 'chay' || undefined}
            onClick={bamChay}
          >
            {nhanDang('chay', nhanNutChay)}
          </button>
        </>
      ) : (
        <>
          {/* Cho đi tiếp CHỈ có nghĩa ở chế độ nghiệm thu. Ở chế độ tự chạy engine không
              chờ giấy phép nào, nên một nút cấp phép ở đó không làm gì cả. */}
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
          {/* Truyện đã xong thì không còn chương nào để "đi tiếp" theo chế độ nào cả — công tắc
              ở đó là một lựa chọn không đổi được gì. Viết thêm sẽ mở lại nó. */}
          {daXong ? null : (
            <div className="dkChon" role="group" aria-label={CHU.cheDoDiTiep}>
                <span className="dkChonDe">{CHU.cheDoDiTiep}</span>
                {(
                  [
                    ['auto', DIEU_KHIEN.lienTuc, CHU.cheDoTuChay, GIAI_THICH.cheDoAutoLaGi],
                    ['review', DIEU_KHIEN.tungChuong, CHU.cheDoNghiemThu, GIAI_THICH.cheDoReviewLaGi],
                  ] as const
                ).map(([che, nhan, nhanDu, viSao]) => {
                  const dangBat = che === (choNghiemThu ? 'review' : 'auto');
                  return (
                    <button
                      key={che}
                      type="button"
                      className={`dkChonNut${dangBat ? ' dkBat' : ''}`}
                      aria-pressed={dangBat}
                      aria-label={nhanDu}
                      disabled={khoa || dangBat}
                      // Nhãn hiện ra là bản NGẮN để thanh dưới không cắt "Tự viết liên t…"; tên
                      // đầy đủ ở `aria-label`, lời giải thích ở `title`.
                      title={`${nhanDu} — ${viSao}`}
                      aria-busy={(dangGui === 'chedo' && lenh?.dich === che) || undefined}
                      onClick={() => goi('chedo', () => doiCheDoTien(tacPham, che), che)}
                    >
                      {dangGui === 'chedo' && lenh?.dich === che ? DIEU_KHIEN.dangLam.chedo : nhan}
                    </button>
                  );
              })}
            </div>
          )}

          {/* Đóng máy nhả khóa tệp và nhả suất engine cho cuốn khác. Không có nó thì mở
              cuốn A rồi không bao giờ mở được cuốn B mà không tắt cả studio. */}
          <button
            type="button"
            className="dkNut dkPhu"
            disabled={khoa || dangChay}
            // Máy đang MỞ ở nhánh này — câu "cần mở phiên trước" của bản cũ là câu của nhánh
            // kia, và nói ngược sự thật ngay dưới một phiên đang chạy.
            title={dangChay ? DONG_PHIEN.khiDangChay : undefined}
            aria-busy={dangGui === 'dong' || undefined}
            onClick={() => goi('dong', () => dongMay(tacPham))}
          >
            {nhanDang('dong', CHU.dongMay)}
          </button>

          {/* Ô NEO của nút hạng nhất — CUỐI cụm, tức sát mép phải.
              Chạy và Dừng loại trừ nhau theo trạng thái thật, không phải hai nút luôn hiện:
              một nút Dừng bấm được khi không có gì chạy là một nút nói dối. Vì loại trừ nhau
              nên chúng dùng chung MỘT ô, và ô đó là chỗ cố định duy nhất của cả thanh.

              Đứng cuối chứ không đứng đầu, và đây là một lỗi ĐO ĐƯỢC: ghim cả cụm nút vào mép
              phải vẫn để nút Chạy dịch 107px khi bộ nút đổi từ 3 sang 4, vì mỗi nút phụ thêm
              vào lại đẩy nó sang trái. Ghim cụm là chưa đủ; phải ghim đúng cái nút ấy — đúng
              như bàn transport của DAW, nơi play–stop là một chỗ không bao giờ đổi. */}
          {/* Đứng ở cửa duyệt thì việc hạng nhất LÀ duyệt, nên nó chiếm đúng ô neo này thay cho
              "Tiếp tục viết". Bản trước vẽ cả hai cạnh nhau: hai nút nghĩa gần như một, và người
              dùng không biết bấm cái nào thì engine mới thật sự viết tiếp. */}
          {dangChoDuyet && !dangChay ? (
            <button
              type="button"
              className="dkNut dkChay"
              disabled={khoa}
              aria-busy={dangGui === 'tiep' || undefined}
              onClick={() => goi('tiep', () => choDiTiep(tacPham))}
            >
              {nhanDang('tiep', CHU.nhanChoDiTiep(snapshot.book.completed_chapters))}
            </button>
          ) : dangChay ? (
            <button
              type="button"
              className="dkNut dkDung"
              disabled={khoa || dangThuDon}
              title={dangThuDon ? GIAI_THICH.dangThuDon : undefined}
              aria-busy={dangGui === 'dung' || undefined}
              onClick={() => goi('dung', () => dungSach(tacPham))}
            >
              {nhanDang('dung', `‖ ${CHU.dung}`)}
            </button>
          ) : (
            <button
              type="button"
              className={lopChay}
              disabled={khoa || dangThuDon}
              title={dangThuDon ? GIAI_THICH.dangThuDon : viSaoChay}
              aria-busy={dangGui === 'chay' || dangThuDon || undefined}
              onClick={bamChay}
            >
              {dangThuDon ? DIEU_KHIEN.dangDungHan : nhanDang('chay', nhanNutChay)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
