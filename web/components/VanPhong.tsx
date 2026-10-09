'use client';

import { layVanPhong } from '@/lib/api';
import { CHU, GIAI_THICH, nhanTinhTrangLuat } from '@/lib/nhan';
import type { ArcStyle, CharacterVoice, UserStyle } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import { HoSoKhung, VongTen, tinhTrangNguon } from './HoSoKhung';

/**
 * Văn phong: engine đang viết theo luật gì.
 *
 * # Bề mặt này có HAI NGUỒN, và trộn chúng lại là lỗi nặng nhất có thể mắc ở đây
 *
 * `meta/user_rules.json` — người dùng KHAI, có ngay từ lúc mở sách. Là CHỈ THỊ:
 * "hãy viết như thế này".
 *
 * `meta/style_rules.json` — Editor CHƯNG RA từ chương đã viết, ở ranh giới cung.
 * Là MÔ TẢ: "văn của cuốn này hoá ra đang như thế này".
 *
 * Hai thứ ngược chiều nhân quả, và người vận hành mở bề mặt này thường là để đối
 * chiếu đúng hai chiều đó — "tôi dặn thế, nó viết ra thế, lệch ở đâu". Gộp thành
 * một danh sách luật thì câu hỏi ấy không còn đặt được, mà đó là câu hỏi duy nhất
 * chỉ bề mặt này trả lời được.
 *
 * # Vì sao không bọc thẳng `WritingStyleRules` như thiết kế đầu
 *
 * Vì `style_rules.json` chỉ tồn tại SAU ranh giới cung đầu tiên. Một bề mặt chỉ
 * đọc tệp đó sẽ rỗng trơn suốt cả cung đầu của mọi tác phẩm — rỗng đúng lúc người
 * vận hành cần nhất, khi họ vừa dặn xong và muốn biết engine có nghe không. Nguồn
 * thứ hai lấp đúng khoảng đó.
 *
 * # Thứ tự hai khối, và vì sao chỉ thị đứng trước
 *
 * Chỉ thị có trước theo thời gian, tồn tại ở mọi tác phẩm kể cả tác phẩm chưa viết
 * chương nào, và nó là mặt người vận hành sửa được. Khối mô tả đứng sau để đọc như
 * một câu trả lời cho khối trên.
 */
export function VanPhong({ tacPham }: { tacPham: string | undefined }) {
  const tai = useHoSo(tacPham, layVanPhong);
  const tt = tinhTrangNguon(tai);

  const arc = tai.du?.arc_style ?? null;
  const khai = tai.du?.user_rules ?? null;
  const canhBao = tai.du?.warnings ?? null;

  return (
    <HoSoKhung tieuDe={CHU.vanPhong} motTa={tt ? undefined : motTa(arc, khai)} lop="tg tgVanPhong">
      {tt ?? (
        <div className="tgThan">
          {/* Một nguồn hỏng mà nguồn kia còn đọc được thì server trả 200 kèm
              `warnings` — nên ca "đọc được mà hỏng" KHÔNG đi qua nhánh lỗi fetch,
              và nếu chỉ bắt lỗi fetch thì nó biến mất không dấu vết. */}
          {canhBao && canhBao.length > 0 ? (
            <section className="canhbao" aria-label={GIAI_THICH.nguonKhongDocDuocTieuDe}>
              <h2>
                <span aria-hidden="true">■</span>
                {GIAI_THICH.nguonKhongDocDuocTieuDe} · {canhBao.length}
              </h2>
              <ul>
                {canhBao.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {arc === null && khai === null ? (
            // Cả hai nguồn đều vắng: câu RIÊNG kể tên cả hai tệp. Dùng
            // `nguonChuaGhi` của một nguồn ở đây sẽ để người đọc tưởng nguồn kia đã
            // có mà rỗng — hai ca đó dẫn tới hai chỗ khác nhau để đi xem.
            <section className="sect">
              <p className="trongSect">{GIAI_THICH.vanPhongChuaCoNguonNao}</p>
            </section>
          ) : (
            <>
              <p className="tgChuThich tgVpGioiThieu">{GIAI_THICH.vanPhongHaiNguon}</p>
              <KhoiKhai khai={khai} />
              <KhoiChung arc={arc} />
            </>
          )}
        </div>
      )}
    </HoSoKhung>
  );
}

/** Luật người dùng khai — CHỈ THỊ. */
function KhoiKhai({ khai }: { khai: UserStyle | null }) {
  if (khai === null) {
    return (
      <section className="sect tgVpThe">
        <h2>{CHU.luatDaKhai}</h2>
        <p className="trongSect">
          {GIAI_THICH.nguonChuaGhi(
            GIAI_THICH.vanPhongKhaiTepNguon,
            GIAI_THICH.vanPhongKhaiKhiNao,
          )}
        </p>
      </section>
    );
  }

  const cumCam = khai.forbidden_phrases ?? [];
  const kyCam = khai.forbidden_chars ?? [];
  const tuMoi = khai.fatigue_words ? Object.entries(khai.fatigue_words) : [];
  const khaiTu = khai.declared_by ?? [];
  const chuaChac = khai.uncertain ?? [];
  const rong =
    cumCam.length === 0 &&
    kyCam.length === 0 &&
    tuMoi.length === 0 &&
    chuaChac.length === 0 &&
    !khai.preferences &&
    !khai.genre;

  return (
    <section className="sect tgVpThe">
      <h2>
        {CHU.luatDaKhai}
        <span className="vien">{CHU.chiThi}</span>
      </h2>
      <p className="steerhint">{GIAI_THICH.vanPhongNguonKhai}</p>

      {/* `degraded` là tin vận hành thật: phần luật máy-kiểm-được của một nguồn
          KHÔNG còn được cưỡng chế nữa. Người vận hành đọc "đã khai cụm từ cấm" mà
          engine không chặn thì họ cần biết vì sao. */}
      {khai.status === 'degraded' ? (
        <p className="vphacap">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          <span>
            <strong>{nhanTinhTrangLuat(khai.status)}.</strong> {GIAI_THICH.vanPhongHaCap}
          </span>
        </p>
      ) : null}

      {rong ? (
        <p className="trongSect">
          {GIAI_THICH.nguonCoMaRong(GIAI_THICH.vanPhongKhaiTepNguon, 'luật')}
        </p>
      ) : (
        <>
          <dl className="kv kvvp">
            {khai.genre ? (
              <>
                <dt>{CHU.theLoai}</dt>
                <dd>{khai.genre}</dd>
              </>
            ) : null}
            {khaiTu.length > 0 ? (
              <>
                <dt title={GIAI_THICH.vanPhongKhaiTuDay}>{CHU.khaiTu}</dt>
                <dd className="m">{khaiTu.join(' · ')}</dd>
              </>
            ) : null}
          </dl>

          {cumCam.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.cumTuCam}</h3>
              <ul className="vpthe">
                {cumCam.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Mỗi ký tự một chip mono riêng: phần lớn là dấu câu (— … " ) và một
              danh sách nối bằng `·` sẽ không phân biệt được đâu là ký tự bị cấm,
              đâu là dấu nối của giao diện. */}
          {kyCam.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.kyTuCam}</h3>
              <ul className="vpthe vpky">
                {kyCam.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Từ mỏi KHÔNG phải danh sách cấm, và nhãn phải nói ra điều đó: nó là
              hạn mức mỗi chương. Xếp chung với cụm từ cấm rồi để người đọc tự suy
              là cách một hạn mức bị đọc thành một lệnh cấm. */}
          {tuMoi.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.tuMoi}</h3>
              <p className="steerhint">{GIAI_THICH.vanPhongTuMoi}</p>
              <ul className="vpmoi">
                {tuMoi.map(([tu, hanMuc]) => (
                  <li key={tu}>
                    <span className="tu">{tu}</span>
                    <span className="han">{CHU.toiDaMoiChuong(hanMuc)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* `--ui`, không serif: đây là chữ người vận hành viết cho engine, không
              phải văn nằm trong bộ truyện xuất bản. Phép thử ở DESIGN.md:64. */}
          {khai.preferences ? (
            <div className="vpnhom">
              <h3>{CHU.uaThich}</h3>
              <VanUaThich chu={khai.preferences} />
            </div>
          ) : null}

          {chuaChac.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.chuaChacChan}</h3>
              <p className="steerhint">{GIAI_THICH.vanPhongChuaChac}</p>
              <ul className="vpthe vpngo">
                {chuaChac.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Luật Editor chưng ra ở ranh giới cung — MÔ TẢ.
 *
 * `volume`/`arc` không phải nhãn trang trí mà là CỬA SỔ của cả khối: bộ luật này
 * mô tả cung vừa ĐÓNG. Câu đó phải đọc được ngay trên bề mặt, không nhét vào
 * `title` — một cửa sổ mà phải trỏ chuột mới biết thì phần lớn người đọc sẽ không
 * biết (cùng lập luận đã viết cho đầu cột của bảng Tổ sản xuất).
 */
function KhoiChung({ arc }: { arc: ArcStyle | null }) {
  if (arc === null) {
    return (
      <section className="sect tgVpThe">
        <h2>{CHU.editorChungRa}</h2>
        <p className="trongSect">
          {GIAI_THICH.nguonChuaGhi(
            GIAI_THICH.vanPhongTepNguon,
            GIAI_THICH.vanPhongKhiNao,
          )}
        </p>
      </section>
    );
  }

  const loiKe = arc.prose ?? [];
  const giong = arc.dialogue ?? [];
  const cam = arc.taboos ?? [];
  const rong = loiKe.length === 0 && giong.length === 0 && cam.length === 0;

  return (
    <section className="sect tgVpThe">
      <h2>
        {CHU.editorChungRa}
        <span className="vien">{CHU.moTa}</span>
        {/* `volume === 0` nghĩa là chưa gắn được tập/cung, nên nhãn phẳng chỉ có
            cung. Kiểm `> 0`, không kiểm falsy — cùng luật, chỉ khác chỗ: ở đây 0
            THẬT SỰ là "không biết", và server đã nói vậy ở model.go:272. */}
        <span className="phu">
          {arc.volume > 0
            ? CHU.chotOCung(arc.volume, arc.arc)
            : CHU.chotOCungPhang(arc.arc)}
        </span>
      </h2>
      <p className="steerhint">{GIAI_THICH.vanPhongNguonChung}</p>
      <p className="vpcuaso">
        <span className="ky" aria-hidden="true">
          ◆
        </span>
        <span>{GIAI_THICH.vanPhongCuaSo}</span>
      </p>

      {/* Tệp CÓ mà chưa chưng được luật nào KHÁC với chưa có tệp — và ở đây ta
          BIẾT là có tệp, vì `arc_style` không null. Nói đúng ca đó. */}
      {rong ? (
        <p className="trongSect">
          {GIAI_THICH.nguonCoMaRong(GIAI_THICH.vanPhongTepNguon, 'quy tắc')}
        </p>
      ) : (
        <>
          {loiKe.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.loiKe}</h3>
              <p className="steerhint">{GIAI_THICH.vanPhongLoiKe}</p>
              <ol className="vpluat">
                {loiKe.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {giong.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.giongNhanVat}</h3>
              <ul className="vpgiong">
                {giong.map((g) => (
                  <MotGiong key={g.name} g={g} />
                ))}
              </ul>
            </div>
          ) : null}

          {/* Danh sách cấm mang `--amber`, KHÔNG `--red`: đỏ trong hệ này là LỖI
              đã xảy ra (DESIGN.md:48), còn đây là ràng buộc đang có hiệu lực. Tô
              đỏ một danh sách luật thường trực làm màu lỗi mất nghĩa chỗ khác. */}
          {cam.length > 0 ? (
            <div className="vpnhom">
              <h3>{CHU.danhSachCam}</h3>
              <p className="steerhint">{GIAI_THICH.vanPhongCam}</p>
              <ul className="vpcam">
                {cam.map((c, i) => (
                  <li key={i}>
                    <span className="ky" aria-hidden="true">
                      ■
                    </span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Chữ "Nên dùng" là markdown thô của người dùng (`## [startup_prompt]` rồi đoạn văn).
 * Tiêu đề thành nhãn nhỏ, ngoặc vuông bỏ đi — để lại `##` giữa văn là rác markdown, cùng lỗi
 * đã sửa ở tiền đề.
 */
function VanUaThich({ chu }: { chu: string }) {
  const khoi: { tieuDe?: string; doan: string[] }[] = [];
  let hien: { tieuDe?: string; doan: string[] } = { doan: [] };
  khoi.push(hien);
  for (const dong of chu.split('\n')) {
    const tieuDe = dong.match(/^\s*#{1,6}\s+(.*\S)\s*$/);
    if (tieuDe) {
      hien = { tieuDe: tieuDe[1]!.replace(/^\[(.*)\]$/, '$1').replace(/_/g, ' '), doan: [] };
      khoi.push(hien);
    } else if (dong.trim()) {
      hien.doan.push(dong.trim());
    }
  }
  return (
    <>
      {khoi
        .filter((k) => k.tieuDe || k.doan.length > 0)
        .map((k, i) => (
          <div className="vpvan" key={i}>
            {k.tieuDe ? <span className="tgNhanPhu m">{k.tieuDe}</span> : null}
            {k.doan.map((d, j) => (
              <p key={j}>{d}</p>
            ))}
          </div>
        ))}
    </>
  );
}

function MotGiong({ g }: { g: CharacterVoice }) {
  const luat = g.rules ?? [];
  return (
    <li>
      <h4>
        <VongTen ten={g.name} />
        {g.name}
      </h4>
      {luat.length > 0 ? (
        <ul>
          {luat.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : (
        <p className="trongSect">{GIAI_THICH.vanPhongGiongRong}</p>
      )}
    </li>
  );
}

/**
 * Dòng mô tả — chỉ đếm điều đếm được, và nói rõ số nào thuộc nguồn nào.
 *
 * Không gộp thành một tổng "12 quy tắc": hai nguồn khác bản chất nên một tổng
 * chung là con số không trả lời câu hỏi nào.
 */
function motTa(arc: ArcStyle | null, khai: UserStyle | null): string | undefined {
  const phan: string[] = [];
  if (khai) {
    const n =
      (khai.forbidden_phrases?.length ?? 0) +
      (khai.forbidden_chars?.length ?? 0) +
      Object.keys(khai.fatigue_words ?? {}).length;
    if (n > 0) phan.push(CHU.demLuatKhai(n));
  }
  if (arc) {
    const n = arc.prose?.length ?? 0;
    if (n > 0) phan.push(CHU.demQuyTac(n));
    const g = arc.dialogue?.length ?? 0;
    if (g > 0) phan.push(CHU.demNhanVatCoGiong(g));
  }
  return phan.length > 0 ? phan.join(' · ') : undefined;
}
