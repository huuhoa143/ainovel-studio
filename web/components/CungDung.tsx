'use client';

import { useEffect, useRef, useState } from 'react';

import { LoiApi, cungDungGiaiDoan, cungDungMoSach } from '@/lib/api';
import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import { CHU, GIAI_THICH, nhanVai } from '@/lib/nhan';
import type { DapCungDung, LuotCungDung } from '@/lib/types';

import { BieuTuong } from './BieuTuong';

/**
 * Cùng dựng — đối thoại nhiều lượt để làm rõ ý trước khi engine chạy.
 *
 * Hai chế độ dùng chung bề mặt này:
 *   - `mo-sach`: làm rõ yêu cầu cho một tác phẩm CHƯA có.
 *   - `giai-doan`: tạm dừng dây chuyền rồi cùng quy hoạch chặng tiếp.
 *
 * # Ba luật khi áp phản hồi, và tại sao chúng KHÔNG hiển nhiên
 *
 * Lấy nguyên từ `internal/entry/startup/cocreate.go:ApplyReply` — nơi upstream đã ghi lý do:
 *
 *  1. Lượt assistant đưa vào lịch sử là `raw` (bản đầy đủ có `[DRAFT]`), không phải
 *     `message`. Chỉ ghi `message` thì lượt sau mô hình không thấy bản nháp của chính nó và
 *     phải quy nạp lại từ đối thoại mỗi lượt — chi tiết ở các lượt đầu rơi dần.
 *  2. `draft` rỗng nghĩa là GIỮ bản cũ. Đường phân tích suy giảm trả `draft` rỗng, và ghi
 *     đè bằng nó sẽ cắt trắng bản yêu cầu người dùng đã tích lũy qua nhiều lượt.
 *  3. `suggestions` ghi đè hoàn toàn mỗi lượt, kể cả thành rỗng — gợi ý chỉ có nghĩa cho
 *     đúng lượt hiện tại.
 *
 * Gộp cả ba vào MỘT hàm `apDung` để không có chỗ thứ hai làm khác.
 */
export function CungDung({
  cheDo,
  tacPham,
  onXong,
}: {
  cheDo: 'mo-sach' | 'giai-doan';
  tacPham: string | undefined;
  /** Gọi khi bản nháp đã sẵn sàng — bên gọi quyết định làm gì với nó. */
  onXong: (banNhap: string) => void;
}) {
  const [lichSu, datLichSu] = useState<LuotCungDung[]>([]);
  const [banNhap, datBanNhap] = useState('');
  const [sanSang, datSanSang] = useState(false);
  const [goiY, datGoiY] = useState<string[]>([]);
  const [chu, datChu] = useState('');
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<string | null>(null);

  /** Ba luật của ApplyReply, ở đúng một chỗ. */
  const apDung = (d: DapCungDung) => {
    const tho = (d.raw ?? '').trim() || d.message.trim();
    if (tho) {
      datLichSu((cu) => [...cu, { role: 'assistant', text: tho }]);
    }
    const nhap = (d.draft ?? '').trim();
    if (nhap) datBanNhap(nhap); // rỗng = GIỮ bản cũ, luật 2
    datSanSang(d.ready);
    datGoiY(d.suggestions ?? []); // ghi đè kể cả thành rỗng, luật 3
  };

  const gui = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const moi: LuotCungDung[] = [...lichSu, { role: 'user', text: t }];
    datLichSu(moi);
    datChu('');
    datDangGui(true);
    datLoi(null);

    const goi =
      cheDo === 'giai-doan' && tacPham
        ? cungDungGiaiDoan(tacPham, moi)
        : cungDungMoSach(moi);

    goi
      .then(apDung)
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(false));
  };

  const nhap = useRef<HTMLTextAreaElement>(null);
  const danhSach = useRef<HTMLDivElement>(null);
  // Lượt mới luôn ở đáy: cuộn theo nó, như mọi khung trò chuyện.
  useEffect(() => {
    const d = danhSach.current;
    if (d) d.scrollTop = d.scrollHeight;
  }, [lichSu.length, dangGui]);

  const dienY = (cau: string) => {
    datChu(cau);
    nhap.current?.focus();
  };

  return (
    <main className="canvas" id="cung-dung">
      <div className="head">
        <h1>{CHU.cungDung}</h1>
        {lichSu.length > 0 ? <span className="sub">{T.cdSoLuot(lichSu.filter((m) => m.role === 'user').length)}</span> : null}
      </div>

      <div className="cdKhung">
        <section className="cdTroChuyen" aria-label={CHU.cungDung}>
          {cheDo === 'giai-doan' ? (
            <p className="vphacap cdTamDung">
              <span className="ky" aria-hidden="true">
                ■
              </span>
              <span>{GIAI_THICH.cungDungGiaiDoanTamDung}</span>
            </p>
          ) : null}

          <div className="cdList" ref={danhSach} aria-live="polite">
            {lichSu.length === 0 ? (
              <div className="cdChao">
                <span className="cdChaoDau" aria-hidden="true">
                  <BieuTuong ten="yTuong" co={20} />
                </span>
                <h2>{T.cdChaoDe}</h2>
                <p>{T.cdChaoThan}</p>
                <p className="cdChaoPhu">{GIAI_THICH.cungDungGiaiThich}</p>
                <div className="cdChaoChip" role="group" aria-label={T.thuMotY}>
                  {T.yTuongMau.slice(0, 4).map((m) => (
                    <button key={m.the} type="button" className="chip" onClick={() => dienY(m.cau)}>
                      {m.the}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {lichSu.map((m, i) => (
              <div key={i} className={`cdLuot ${m.role}`}>
                {/* Lượt assistant hiện bản THÔ vì đó là thứ nằm trong lịch sử, và nó chứa cả
                    `[DRAFT]`. Hiện `message` cho đẹp rồi gửi `raw` sẽ làm người dùng thấy một
                    cuộc đối thoại khác với cuộc mà mô hình đang thấy. */}
                <span className="cdVai">{m.role === 'user' ? CHU.ban : nhanVai('arbiter')}</span>
                <p className="cdChu">{m.text}</p>
              </div>
            ))}
            {dangGui ? (
              <div className="cdLuot assistant cdDangNghi" role="status">
                <span className="cdVai">{nhanVai('arbiter')}</span>
                <span className="cdBa" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="anChu">{T.cdDangNghi}</span>
              </div>
            ) : null}
          </div>

          <div className="cdDay">
            {loi ? (
              <p className="loiDoc" role="alert">
                {loi}
              </p>
            ) : null}

            {goiY.length > 0 && !dangGui ? (
              <div className="cdGoiY">
                <span className="lbl">{CHU.goiYTiepTheo}</span>
                {goiY.map((g) => (
                  <button key={g} type="button" className="chip" onClick={() => gui(g)}>
                    {g}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="cdNhap"
              onSubmit={(e) => {
                e.preventDefault();
                gui(chu);
              }}
            >
              <textarea
                ref={nhap}
                rows={2}
                value={chu}
                aria-label={T.cdNhap}
                onChange={(e) => datChu(e.target.value)}
                onKeyDown={(e) => {
                  // `isComposing`: bộ gõ tiếng Việt (Telex, VNI) giữ phím Enter để chốt chữ đang
                  // ghép. Gửi lúc đó là gửi một chữ dở dang.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    gui(chu);
                  }
                }}
                placeholder={
                  lichSu.length === 0
                    ? 'Viết truyện trinh thám điều tra dài, nhịp chậm, giọng tiết chế…'
                    : 'Trả lời hoặc nói thêm…'
                }
                disabled={dangGui}
              />
              <div className="cdNhapChan">
                <span className="cdPhim">{T.cdGoiYGui}</span>
                <button type="submit" className="nutChinh" disabled={dangGui || !chu.trim()}>
                  {dangGui ? CHU.dangGui : CHU.guiLuot}
                </button>
              </div>
            </form>
          </div>
        </section>

        <aside className="cdBen" aria-labelledby="cd-ban-nhap">
          <div className={`the cdBanNhap${banNhap ? '' : ' trong'}`}>
            <div className="cdBanDau">
              <h2 id="cd-ban-nhap">{CHU.banNhapHienTai}</h2>
              {banNhap ? (
                <span className={`vien ${sanSang ? 'teal' : 'violet'}`}>
                  {sanSang ? T.cdSanSang : T.cdChuaSanSang}
                </span>
              ) : null}
            </div>
            {banNhap ? (
              <>
                <p className="cdvan">{banNhap}</p>
                {/* Nút chốt chỉ bật khi mô hình nói `ready`. Không suy từ việc bản nháp có
                    rỗng hay không: một lượt suy giảm có bản nháp rỗng mà vẫn ready, và ngược
                    lại. */}
                <button
                  type="button"
                  className="nutChinh cdChot"
                  disabled={!sanSang}
                  onClick={() => onXong(banNhap)}
                >
                  {CHU.chotBanNhap}
                </button>
                {!sanSang ? <p className="cdChotPhu">{T.cdChuaSanSangPhu}</p> : null}
              </>
            ) : (
              <p className="cdTrong">{T.cdBanNhapTrong}</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
