'use client';

import { so } from '@/lib/dinhdang';
import { giaiCongCu } from '@/lib/congCu';
import { giaiGiaoViec } from '@/lib/loiLlm';
import { CHU, GIAI_THICH, nhanVai } from '@/lib/nhan';
import type { NguCanh, Snapshot, Vai } from '@/lib/types';
import { type NutVai, cayVai } from '@/lib/vaiTro';

/**
 * DẢI TRẠNG THÁI — cột trái của TUI, xoay ngang.
 *
 * Nó trả lời đúng một câu: "máy đang làm gì". Ai đang chạy, ai đang chờ, còn việc gì tồn, và
 * ngữ cảnh đã ăn bao nhiêu cửa sổ.
 *
 * # Vì sao mỗi trường sống có HAI nhánh vẽ
 *
 * `agents`, `idle_agents`, `context` là ba trong năm TRƯỜNG SỐNG của hợp đồng (spec §6.1).
 * `null` ở đó nghĩa là engine đang ĐÓNG nên studio KHÔNG ĐO ĐƯỢC — khác hẳn `[]` hay `0`,
 * vốn nghĩa là "đã đo, bằng không". Nên ở đây không có `?? 0` và không có `?? []`: mỗi trường
 * kiểm `=== null` trước, rồi mới đọc.
 *
 * Đây không phải sự cẩn thận thừa. Dự án này đã trả giá một lần cho đúng lớp lỗi đó: một kiểu
 * TypeScript khai không-null cho một trường server trả `null` (`Timeline.volumes`) làm `tsc`
 * xanh trong khi renderer SẬP ở bề mặt mặc định, và lỗi sống lâu vì mọi fixture đều có dữ
 * liệu. Ở dải này hệ quả không phải cú sập mà là một lời nói dối nhỏ hiện suốt: một cây thước
 * ngữ cảnh 0% vẽ cho một thứ không có nguồn khẳng định model đang dùng 0% cửa sổ.
 *
 * # Vì sao cây vai là `<ul>`/`<li>` lồng nhau chứ không phải thụt lề bằng khoảng trắng
 *
 * Bậc lồng của vai là CẤU TRÚC, không phải trang trí: `novel_context` chạy DƯỚI `writer` là
 * một quan hệ, và trình đọc màn hình chỉ đọc được quan hệ đó nếu DOM có nó. Thụt lề bằng
 * khoảng trắng hay bằng `padding-left` vẽ ra đúng hình đó cho mắt và không gì cho tai.
 */
export function DaiTrangThai({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className="daitrangthai" aria-label={CHU.daiTrangThaiVung}>
      <OVai agents={snapshot.agents} />
      <OVieccTon steer={snapshot.pending_steer} lyDo={snapshot.rewrite_reason} />
      <ONguCanh nc={snapshot.context} />
    </section>
  );
}

/**
 * Vai đang chạy (cây).
 *
 * Không còn dòng "chờ: …". `idle_agents` là các vai engine đang để RẢNH — ở chặng viết, đó là
 * Kiến trúc sư đã dựng xong nền. In "chờ: Kiến trúc sư" ngay dưới Người viết đang viết đọc như
 * Người viết đang đợi Kiến trúc sư, tức nói ngược việc đã xảy ra (đo được trên truyện thật).
 */
function OVai({ agents }: { agents: Vai[] | null }) {
  return (
    <div className="dtvai">
      <span className="dtnhan">{CHU.vaiDangChay}</span>

      {agents === null ? (
        <KhongDo />
      ) : agents.length === 0 ? (
        // `[]` là một phép đo đã thực hiện: engine mở, không vai nào chạy. Nói ra bằng một
        // câu khác hẳn câu của `null` — gộp hai ca lại là bỏ mất tin "engine còn sống".
        <span className="dttrong">{GIAI_THICH.chuaCoVaiNaoChay}</span>
      ) : (
        <ul className="cayvai">
          {cayVai(agents).map((n, i) => (
            <NhanhVai key={khoaVai(n, i)} nut={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Một vai và các vai nó gọi.
 *
 * `key` ghép tên vai với vị trí trong hàng anh em: cùng một vai xuất hiện hai lần ở hai nhánh
 * là ca thật (Writer gọi tool, rồi Writer lại chạy ở nhánh khác), nên chỉ tên thôi thì trùng
 * khóa. Danh sách này ngắn và bị thay nguyên cụm mỗi lần snapshot mới về, nên nó không có bài
 * toán "bỏ phần tử đầu" mà `LuotVan.id` phải giải ở khu văn sống.
 */
function NhanhVai({ nut }: { nut: NutVai }) {
  const v = nut.vai;
  return (
    <li>
      <span className="vaiten">{nhanVai(v.role)}</span>

      {/* Tên công cụ dịch qua CÙNG một bảng với Diễn biến và thanh dưới (`lib/congCu.ts`);
          tên lạ giữ nguyên, nguyên văn luôn ở `title`. Mũi tên là trang trí. */}
      {v.tool ? (
        <span className="vaicongcu" title={v.tool}>
          <span aria-hidden="true">→ </span>
          {giaiCongCu(v.tool) ?? v.tool}
        </span>
      ) : null}

      {/* `turn` là `?: number` — vắng nghĩa là engine không báo lượt cho vai này. Kiểm
          `!== undefined` chứ không kiểm falsy: `turn: 0` là lượt đầu tiên, một tin thật. */}
      {v.turn !== undefined ? (
        <span className="vailuot" title={GIAI_THICH.soLuotVaiLaGi}>
          {CHU.luotVai(v.turn)}
        </span>
      ) : null}

      {/* Việc kiểu "engine → architect_short (Hãy xây dựng…)" là dòng nội bộ: đọc thành câu
          "Điều phối giao việc cho Kiến trúc sư", nguyên văn ở `title`. */}
      {v.task ? (
        <span className="vaiviec" title={v.task}>
          {giaiGiaoViec(v.task) ?? v.task}
        </span>
      ) : null}

      {nut.con.length > 0 ? (
        <ul>
          {nut.con.map((c, i) => (
            <NhanhVai key={khoaVai(c, i)} nut={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function khoaVai(n: NutVai, i: number): string {
  return `${n.vai.role}-${i}`;
}

/**
 * Việc tồn: ý kiến can thiệp engine chưa tiêu thụ, và lý do chương bị trả về viết lại.
 *
 * Không vẽ gì khi cả hai đều rỗng, và điều đó KHÔNG mâu thuẫn với luật null-khác-rỗng ở trên:
 * hai trường này không phải trường sống. Server khai chúng `omitempty` (internal/serve/
 * model.go:234), nên "engine đóng" và "không có việc tồn nào" đến đây y hệt nhau — vắng khóa.
 * Vẽ một ô "không đo được" cho chúng là khẳng định một điều dữ liệu không nói.
 */
function OVieccTon({ steer, lyDo }: { steer: string | undefined; lyDo: string | undefined }) {
  if (!steer && !lyDo) return null;
  return (
    <div className="dtton">
      <span className="dtnhan">{CHU.vieccTon}</span>
      {steer ? (
        <p className="dttonmuc">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          {CHU.canThiepConTon}: {steer}
        </p>
      ) : null}
      {lyDo ? (
        <p className="dttonmuc">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          {CHU.lyDoVietLai}: {lyDo}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ngữ cảnh: thước + con số, hoặc dấu "không đo được".
 *
 * `percent` của hợp đồng là 0–100 (float), KHÔNG phải 0–1: TUI in nó thẳng bằng `%.0f%%`
 * (internal/entry/tui/layout.go:107). Nên ở đây không dùng `phanTram()` của lib/dinhdang —
 * hàm đó nhân 100 và sẽ cho "4100%".
 */
function ONguCanh({ nc }: { nc: NguCanh | null }) {
  return (
    <div className="dtngucanh">
      <span className="dtnhan">{CHU.nguCanh}</span>
      {nc === null ? (
        <KhongDo />
      ) : (
        <>
          {/* Kẹp về 0–100 trước khi cho vào `width`: một con số ngoài khoảng (cửa sổ đo lệch,
              engine báo quá tải) không được phép đẩy thước tràn ra ngoài dải. Con số THẬT vẫn
              in nguyên bên cạnh — kẹp là việc của hình vẽ, không phải của sự thật. */}
          <span className="thuoc" aria-hidden="true">
            <span className="kim" style={{ width: `${kep(nc.percent)}%` }} />
          </span>
          <span className="dtso">
            {Math.round(nc.percent)}% · {so(nc.tokens)}/{so(nc.window)}
          </span>
        </>
      )}
    </div>
  );
}

function kep(pt: number): number {
  if (!Number.isFinite(pt)) return 0;
  return Math.min(100, Math.max(0, pt));
}

/**
 * Dấu "không đo được" — dùng cho MỌI trường sống đang `null`.
 *
 * Một chỗ duy nhất vì câu giải thích phải giống hệt nhau ở mọi ô: người vận hành gặp nó ở ô
 * ngữ cảnh rồi gặp lại ở ô vai và phải nhận ra ngay đó là cùng một chuyện (engine đóng), chứ
 * không phải hai sự cố khác nhau.
 */
function KhongDo() {
  return (
    <span className="khongdo" title={GIAI_THICH.truongSongNull}>
      {CHU.khongDoDuoc}
    </span>
  );
}
