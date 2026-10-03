'use client';

import { useEffect, useState } from 'react';

import { LoiApi, layCauHinh, taoSach } from '@/lib/api';
import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';
import { CHU, GIAI_THICH, nhanKenhVai, nhanVai } from '@/lib/nhan';
import type { CauHinhDoc } from '@/lib/types';
import { goiYTenThuMuc } from '@/lib/tenThuMuc';

import { BieuTuong } from './BieuTuong';
import { DemGiay } from './TheDangLam';

/**
 * Tạo tác phẩm mới — một câu yêu cầu là đủ.
 *
 * # Vì sao có ô tên thư mục, và vì sao nó KHÔNG phải tên tác phẩm
 *
 * `bootstrap.Config.OutputDir` là trường lúc chạy, mặc định `output/novel` theo thư mục
 * làm việc — tức engine gốc chỉ biết MỘT cuốn cho mỗi CWD. Studio phục vụ nhiều cuốn dưới
 * một gốc nên nó phải tự đặt tên thư mục, và người dùng là người biết mình muốn tên gì.
 *
 * Tên HIỂN THỊ của tác phẩm thì do chính truyện quyết định: Architect đặt nó khi dựng nền.
 * Nên ô này nói rõ nó là tên thư mục, nếu không người dùng gõ tên truyện có dấu vào đây rồi
 * bị từ chối mà không hiểu tại sao.
 *
 * # Vì sao nút nói ra giá trước khi bấm
 *
 * Câu cảnh của brief thiết kế: "sắp bấm một nút sẽ chạy 6 giờ và tiêu 35 đô; cần thấy rõ
 * mình đang đặt cược gì trước khi bấm". Nên nút không chỉ ghi "Bắt đầu" — dòng ngay trên nó
 * nói ra rằng đây là gọi model thật và dây chuyền sẽ chạy liên tục.
 *
 * Không hiện SỐ tiền dự kiến ở đây: số chương do Arbiter quyết sau khi đọc câu yêu cầu, nên
 * mọi con số đưa ra trước lúc đó là số bịa. Bề mặt Chi phí có số thật sau chương đầu.
 */
export function TacPhamMoi({
  onXong,
  nhapSan = '',
  onChonKhu,
}: {
  onXong: (book: string) => void;
  /**
   * Đưa người dùng sang Cấu hình máy khi model sắp dùng không phải cái họ muốn, hoặc sang Bàn
   * ý tưởng khi ý còn mơ hồ.
   */
  onChonKhu?: (khu: 'cau-hinh' | 'cung-dung') => void;
  /**
   * Bản yêu cầu chuyển sang từ Cùng dựng.
   *
   * Đổ vào ô nhập chứ không tự tạo tác phẩm luôn: người dùng còn phải đặt tên thư mục, và
   * một cú tạo ngầm sẽ tiêu tiền thật mà họ chưa xác nhận.
   */
  nhapSan?: string;
}) {
  const [ten, datTen] = useState('');
  /* Tên thư mục tự đi theo ý tưởng cho tới khi người dùng tự sửa nó: bắt họ nghĩ ra một
     chuỗi không dấu trước khi được viết là một bước thừa, đúng lúc họ đang có hứng. */
  const [tuDatTen, datTuDatTen] = useState(true);
  const [yeuCau, datYeuCau] = useState(nhapSan);
  const [dangGui, datDangGui] = useState(false);
  // Mốc bắt đầu lượt chờ — đồng hồ nhích từng giây nói "vẫn đang làm" suốt 10–30 giây Điều phối đọc.
  const [guiLuc, datGuiLuc] = useState<string | null>(null);
  const [loi, datLoi] = useState<string | null>(null);

  /**
   * Cấu hình máy — CHỈ để nói trước bản này sẽ viết bằng model nào.
   *
   * # Vì sao bề mặt tạo sách phải biết điều đó
   *
   * Đây là chỗ quyết định ở Cấu hình máy được TIÊU: cuốn mới nhận `cfg.Provider` và `cfg.Roles`
   * lúc engine mở, và từ đó không đổi được nữa trừ khi đóng máy. Nhưng màn này im lặng hoàn
   * toàn về model — nên người dùng vừa đổi nhà cung cấp ở màn kia xong, sang đây bấm Bắt đầu,
   * và không có gì xác nhận cái vừa đổi đã ăn hay chưa.
   *
   * Hỏng thì im lặng, không chặn: một dòng thông tin không đáng để chặn cả luồng tạo sách.
   */
  const [cauHinh, datCauHinh] = useState<CauHinhDoc | null>(null);
  useEffect(() => {
    let huy = false;
    layCauHinh()
      .then((d) => {
        if (!huy) datCauHinh(d);
      })
      .catch(() => undefined);
    return () => {
      huy = true;
    };
  }, []);

  // Chỉ GỢI Ý — họ sửa được, vì tên thư mục là thứ họ sẽ thấy trên đĩa lâu hơn cả câu này.
  const slug = goiYTenThuMuc;
  const doiYeuCau = (v: string) => {
    datYeuCau(v);
    if (tuDatTen) datTen(slug(v));
  };
  useEffect(() => {
    if (nhapSan && tuDatTen) datTen(slug(nhapSan));
    // chỉ chạy lúc nhận bản nháp từ Bàn ý tưởng
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nhapSan]);
  const gui = () => {
    datDangGui(true);
    datGuiLuc(new Date().toISOString());
    datLoi(null);
    taoSach(ten.trim(), yeuCau.trim())
      .then((r) => onXong(r.book))
      .catch((e: unknown) => datLoi(e instanceof LoiApi ? e.message : String(e)))
      .finally(() => datDangGui(false));
  };

  // Chip thể loại chỉ hiện khi ô còn trống hoặc đang chứa đúng một câu mẫu: đè lên chữ của
  // chính người dùng là xóa mất ý của họ mà không có đường hoàn tác.
  const laCauMau = T.yTuongMau.some((m) => m.cau === yeuCau);
  const hienChip = !dangGui && (!yeuCau.trim() || laCauMau);
  // Ý tưởng toàn ký tự không chuyển được sang tên thư mục (vd. chỉ có dấu câu) để lại ô tên
  // rỗng và nút chính bị khóa. Phần Tùy chọn phải tự mở ra lúc đó, nếu không người dùng thấy
  // một nút xám mà không biết vì sao.
  const thieuTen = !!yeuCau.trim() && !ten.trim();
  const [moTuyChon, datMoTuyChon] = useState(false);

  return (
    <main className="canvas" id="tac-pham-moi">
      <div className="head">
        <h1>{CHU.taoTacPham}</h1>
      </div>

      <div className="tpmLuoi">
        <section className="tpmChinh">
          <form
            className="bieuMau tpmForm"
            onSubmit={(e) => {
              e.preventDefault();
              gui();
            }}
          >
            <label className="tpmY" htmlFor="tpm-y">
              <span className="tpmCau">{CHU.yeuCauTruyen}</span>
              <span className="tpmPhu">{GIAI_THICH.taoSachGiaiThich}</span>
            </label>
            <div className={`tpmO${dangGui ? ' dangGui' : ''}`}>
              <textarea
                id="tpm-y"
                value={yeuCau}
                onChange={(e) => doiYeuCau(e.target.value)}
                autoFocus
                rows={7}
                required
                disabled={dangGui}
                placeholder="Ví dụ: truyện trinh thám điều tra dài, nhịp chậm. Nhân vật chính là một chấp pháp trẻ điều tra chuỗi mất tích ở một trấn ven sông. Giọng tiết chế, mỗi chương khép bằng một hình ảnh cụ thể."
              />
              {hienChip ? (
                <div className="tpmChip" role="group" aria-label={T.thuMotY}>
                  <span className="lbl">{T.thuMotY}</span>
                  {T.yTuongMau.map((m) => (
                    <button
                      key={m.the}
                      type="button"
                      className={`chip${m.cau === yeuCau ? ' bat' : ''}`}
                      aria-pressed={m.cau === yeuCau}
                      onClick={() => doiYeuCau(m.cau)}
                    >
                      {m.the}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Tên thư mục tự sinh từ ý tưởng, nên nó lùi vào Tùy chọn: phần lớn người dùng
                không cần đụng tới. Tóm tắt luôn hiện tên đang dùng để không có gì bị giấu. */}
            <details
              className="tpmTuyChon"
              open={moTuyChon || thieuTen}
              onToggle={(e) => datMoTuyChon(e.currentTarget.open)}
            >
              <summary>
                <BieuTuong ten="mui" co={13} />
                <span>{T.tuyChon}</span>
                <span className="tom">
                  {ten.trim() ? (
                    <>
                      {T.luuO} <code>{ten}</code>
                    </>
                  ) : thieuTen ? (
                    // Chỉ báo thiếu khi ĐÃ có ý tưởng: lúc ô ý tưởng còn trống, tên rỗng là
                    // đúng — nó tự điền khi gõ — và một chữ cảnh báo ở đó là mắng oan.
                    <span className="thieu">{T.chuaCoTenThuMuc}</span>
                  ) : null}
                </span>
              </summary>
              <label className="oNhap">
                <span>{CHU.tenThuMuc}</span>
                <input
                  value={ten}
                  onChange={(e) => {
                    datTen(e.target.value);
                    datTuDatTen(e.target.value === '');
                  }}
                  placeholder="tran-tham-ven-song"
                  pattern="[a-z0-9][a-z0-9_\-]{0,63}"
                  required
                  disabled={dangGui}
                  spellCheck={false}
                />
              </label>
              <p className="steerhint">{GIAI_THICH.taoSachTenThuMuc}</p>
            </details>

            {loi ? (
              <p className="loiDoc" role="alert">
                {loi}
              </p>
            ) : null}

            {/* Đọc xuôi thành: sẽ viết bằng gì → tốn tiền thật → bấm. Câu cam kết là dòng SÁT
                NÚT nhất, vì người dùng đọc dòng gần nút nhất trước khi bấm. */}
            <div className="tpmChan">
              {cauHinh ? <SeVietBang du={cauHinh} onChonKhu={onChonKhu} /> : null}
              <div className="tpmGui">
                <p className="tpmCamKet">{GIAI_THICH.taoSachSeTieuTien}</p>
                <button
                  type="submit"
                  className="nutChinh tpmNut"
                  disabled={dangGui || !ten.trim() || !yeuCau.trim()}
                >
                  {dangGui ? CHU.dangGui : CHU.batDauViet}
                  {dangGui ? null : <BieuTuong ten="mui" co={15} />}
                </button>
              </div>
            </div>

            {/* Lượt chờ này DÀI: `POST /books` gọi `startup.PrepareQuick` ngay trong request,
                tức một lượt Arbiter thật — đo được 10,6s và 14,5s. Một nút đổi chữ thành
                "Đang gửi…" trong mười lăm giây đọc thành treo. Nói ra ai đang làm, làm gì, và
                mất khoảng bao lâu. */}
            {dangGui ? (
              <p className="dangCho" role="status">
                <span className="q" aria-hidden="true" />
                <span>
                  <b>
                    {CHU.arbiterDangDoc}
                    {guiLuc ? <DemGiay tu={guiLuc} /> : null}
                  </b>{' '}
                  {GIAI_THICH.arbiterDangDocLau}
                </span>
              </p>
            ) : null}
          </form>
        </section>

        <aside className="tpmBen" aria-labelledby="tpm-buoc">
          <h2 id="tpm-buoc">{CHU.sauKhiBamGi}</h2>
          <ol className="tpmBuoc">
            {(
              [
                ['arbiter', CHU.buocArbiter],
                ['architect', CHU.buocArchitect],
                ['writer', CHU.buocWriter],
              ] as const
            ).map(([vai, mo], i) => (
              <li key={vai} className={dangGui && i === 0 ? 'dang' : undefined}>
                <span className="nut" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="dau">
                  <b>{nhanVai(vai)}</b>
                  <span className="lau">{T.buocLau[i]}</span>
                </span>
                <span className="mo">{hoaDau(mo.trim())}</span>
              </li>
            ))}
          </ol>
          <p className="tpmGhiChu">{GIAI_THICH.batDauRoiKhongPhaiLamGi}</p>
          {onChonKhu ? (
            <p className="tpmBan">
              {T.chuaRoY}{' '}
              <button type="button" className="lienKet" onClick={() => onChonKhu('cung-dung')}>
                {T.banTruoc}
              </button>
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function hoaDau(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * "Sẽ viết bằng" — vai Chấp bút và vai Kiến trúc, hai vai tiêu gần hết token của một cuốn.
 *
 * Không liệt kê cả bốn vai: đây là một dòng xác nhận trước khi bấm, không phải một bảng cấu
 * hình. Bảng đầy đủ ở Cấu hình máy, và liên kết ngay đây dẫn tới đó.
 */
function SeVietBang({
  du,
  onChonKhu,
}: {
  du: CauHinhDoc;
  onChonKhu?: (khu: 'cau-hinh' | 'cung-dung') => void;
}) {
  const cua = (vai: string) => {
    const r = du.roles?.[vai];
    return `${r?.provider ?? du.provider} · ${r?.model ?? du.model}`;
  };
  return (
    <div className="tpmSe">
      {/* Khối này PHẢI có nhãn. Không có nó, hai tên model treo cạnh nút Bắt đầu mà không nói
          chúng là gì. */}
      <span className="tpmSeDe">{CHU.seVietBang}</span>
      <dl>
        <dt>{nhanKenhVai('writer')}</dt>
        <dd className="m">{cua('writer')}</dd>
        <dt>{nhanKenhVai('architect')}</dt>
        <dd className="m">{cua('architect')}</dd>
      </dl>
      {/* Nút đứng NGOÀI `<dl>`: một cặp `<dt/><dd>` rỗng là một hàng thuật ngữ trống, vô nghĩa
          cho cả mắt lẫn trình đọc màn hình. */}
      {onChonKhu ? (
        <button type="button" className="lienKet" onClick={() => onChonKhu('cau-hinh')}>
          {CHU.doiOCauHinh}
        </button>
      ) : null}
    </div>
  );
}
