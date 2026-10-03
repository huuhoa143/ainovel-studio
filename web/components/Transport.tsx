'use client';

import { useEffect, useState } from 'react';

import { layCauHinh } from '@/lib/api';
import { LOI_LLM } from '@/lib/chu/tien-do';
import { cachDay, daChay, donGia, nangSuat, phanTram, so, tongTien } from '@/lib/dinhdang';
import { CHU, GIAI_THICH, TRANG_THAI_DUNG, TRANG_THAI_MAY_RUNTIME, giaiCongDoan, nhanVai, DH } from '@/lib/nhan';
import { cauLoi, giaiDong, giaiLoi, phatHienKet } from '@/lib/loiLlm';
import { nguCanhMoiNhat } from '@/lib/nguCanh';
import { buocHienTai, mayNaoDo, vaiHienTai } from '@/lib/song';
import type { Activity, StreamEvent, Transport as TransportData, Vai } from '@/lib/types';
import type { CongDoanSong } from '@/lib/useStudio';

/**
 * Thanh transport — trạng thái máy luôn hiện, không cuộn mất.
 *
 * Điểm dễ sai nhất: `transport.last_step` là công đoạn VỪA HOÀN THÀNH, không
 * phải công đoạn đang chạy. Store chỉ ghi checkpoint khi một bước thành công,
 * nên gọi nó là "đang chạy" từng làm giao diện hiện "commit" trong khi engine
 * đang draft chương kế tiếp.
 *
 * Dòng sự kiện ghi đè khi có dữ liệu mới, nhưng nhãn cũng phải theo sự thật của
 * chính sự kiện đó: observer cố ý KHÔNG ghi sự kiện "bắt đầu" vào runtime queue
 * (internal/host/observer.go:191 — để replay không bị nhân đôi), nên phần lớn
 * sự kiện đến cũng là bước vừa xong. Chỉ khi payload còn dở (có ID, FinishedAt
 * là zero value) thì mới được gọi là đang chạy.
 */
export function Transport({
  transport,
  song,
  suKien,
  trong,
  runtime,
  hoatDong,
  dungVi,
  agents,
  children,
}: {
  /** `Snapshot.agents` — cây vai engine tự khai, nguồn tươi nhất cho "ai đang làm". */
  agents?: Vai[] | null;
  /**
   * Điều khiển dây chuyền, chèn từ ngoài.
   *
   * Nhận qua `children` chứ không tự dựng: transport là bề mặt CHỈ ĐỌC về trạng thái máy
   * và nó không nên biết gì về các route ghi. Giữ nó không phụ thuộc `api.ts` cũng là giữ
   * cho nó dựng được ở chế độ mock, nơi không có engine nào để bấm.
   */
  children?: React.ReactNode;
  transport: TransportData | undefined;
  song: CongDoanSong | undefined;
  suKien: StreamEvent[];
  /**
   * `Snapshot.runtime` — engine TỰ KHẲNG ĐỊNH trạng thái của nó. `''` khi engine đóng.
   *
   * Nhận chuỗi thô chứ không nhận một `boolean` đã suy sẵn, và đó là bản sửa cho một lỗi ĐO
   * ĐƯỢC (2026-08-02): bản trước nhận `mayChay?: boolean` và dùng nó cho ĐẦU ĐỌC, trong khi
   * phần chữ vẫn tra `TRANG_THAI_MAY[transport.state]`. Hai kênh, hai nguồn — nên khi
   * `runtime="paused"` gặp `transport.state="running"` thì vạch tắt còn chữ ghi "đang chạy".
   *
   * Một `boolean` cũng KHÔNG chở nổi câu cần nói: nó chỉ phân biệt chạy/không, mà "tạm dừng"
   * (còn một lượt treo) khác "đang nghỉ" (rỗng việc) ở đúng chỗ người vận hành cần biết.
   */
  runtime: string | undefined;
  /**
   * `book.activity` — chỉ dùng khi `runtime` vắng, tức engine ĐÓNG.
   *
   * Suy từ mốc checkpoint nên trễ ở cả hai chiều; đây là sự thật mạnh nhất còn lại khi không
   * có engine nào để hỏi. Việc chọn giữa hai nguồn nằm ở `mayNaoDo`, không ở đây.
   */
  /**
   * Engine đang dừng VÌ SAO, khi lý do ấy cần một tên riêng: đứng ở cửa duyệt, hay tự dừng vì
   * lỗi. Trang tính bằng `trangThaiCua` / `lyDoTuDung` — cùng phép đo với thẻ "đang làm".
   */
  dungVi?: 'cho' | 'tuDung';
  hoatDong: Activity;
  /**
   * true khi xưởng đã đọc xong và KHÔNG có tác phẩm nào. Cần tách khỏi ca "chưa
   * đọc xong": để "đang đọc store…" đứng mãi ở thanh dưới là nói dối, vì lúc đó
   * không có store nào đang được đọc và câu đó sẽ không bao giờ đổi.
   */
  trong?: boolean;
}) {
  // Hook đứng TRƯỚC mọi nhánh return: `transport` đổi từ vắng sang có (đang tải → đã tải) là
  // ca thường, và một hook gọi sau `return` sớm làm số hook giữa hai lần vẽ khác nhau.
  const seDung = useSeDung();
  if (!transport) {
    return (
      // Cùng hai vùng như nhánh chính, không phải một hàng phẳng: nếu nhánh này khác cấu
      // trúc thì lưới CSS không áp được và cụm nút nhảy sang trái đúng lúc đang tải — tức
      // đúng cái vừa sửa, chỉ ở một ca hiếm hơn nên khó thấy hơn.
      <footer className="trans">
        <div className="dai">
          <div className="cell ghim">
            <span className="lbl">{trong ? CHU.khongCoGiTheoDoi : CHU.dangTai}</span>
          </div>
        </div>
        {children}
      </footer>
    );
  }

  // MỘT phép suy cho cả chữ, ký hiệu, nhịp đập và đầu đọc. Bốn kênh, một nguồn — xem lý do
  // đầy đủ (và cái giá đã trả) ở `mayNaoDo` trong lib/song.ts.
  const khoaMay = mayNaoDo(runtime, hoatDong);
  const may = khoaMay !== 'running' && dungVi ? TRANG_THAI_DUNG[dungVi] : TRANG_THAI_MAY_RUNTIME[khoaMay];
  const mayChay = khoaMay === 'running';
  const ncc = transport.last_call?.provider;
  // Chạy mà chỉ toàn thử lại một lỗi thì với người dùng là KẸT — cùng phép đo với thẻ đang làm.
  const ket = mayChay ? phatHienKet(suKien, { ncc }) : undefined;
  // Cùng phép chọn với thẻ đang làm — xem `buocHienTai`. Máy không chạy thì không bước nào
  // "đang làm", kể cả khi cây vai còn sót một vai chưa kịp về rảnh.
  const hien = buocHienTai({ agents: agents ?? null, transport }, song);
  const buoc = hien.buoc;
  const dangChay = mayChay && hien.dangChay;
  const nhanBuoc = dangChay ? CHU.buocDangChayNgan : CHU.congDoanVuaXong;
  const chuGiaiBuoc = dangChay ? GIAI_THICH.buocDangChay : GIAI_THICH.buocVuaXong;

  // `last_call` (usage.json) là lượt gọi THẬT gần nhất, kèm tên nhà cung cấp; `transport.model`
  // chỉ là model mặc định lúc mở phiên. Có `last_call` thì tin nó.
  const lc = transport.last_call;
  const vai = vaiHienTai({ agents: agents ?? null, transport }, song?.vai);
  const loiBuoc = giaiLoi(buoc, { ncc, vai });
  const modelLuot = lc ? `${lc.provider} · ${lc.model}` : transport.model;
  const khiNao = !mayChay ? cachDay(lc?.at) : undefined;
  // Hai ô "lượt trước" và "lần tới" nói CÙNG một tên model ở ca thường, và cặp ô ấy (≈280px)
  // là thứ đẩy "thời gian viết" ra khỏi mép cắt ở 1512px. Trùng thì gộp làm một.
  const trungModel = !!seDung && seDung === modelLuot;
  /* Câu đầy đủ của ô `tổ` cho `title` — ô bị chặn bề rộng nên tên model dài sẽ
     bị cắt trên màn hình, và đây là chỗ tra lại được. */
  const toDayDu = [vai ? nhanVai(vai) : null, modelLuot, khiNao].filter(Boolean).join(' · ');
  const nc = nguCanhMoiNhat(suKien);
  const nangSuatSo = nangSuat(transport.chapters_per_hour);
  const donGiaSo = donGia(transport.cost_per_chapter);
  const tong = tongTien(transport.cost_usd);
  const chay = daChay(transport.elapsed_ms);

  return (
    <footer className="trans" data-chay={mayChay ? '1' : undefined} aria-label={DH.trangThaiViet}>
      {/* HAI VÙNG, không một hàng xuống dòng được.
          Bản trước là `flex-wrap: wrap` với cụm nút (`children`) là phần tử cuối, nên điểm
          xuống dòng phụ thuộc DỮ LIỆU — và ĐO ĐƯỢC ở 1512px, đổi tên công đoạn từ "commit"
          sang "writer (Viết chương 10)" đẩy nút Chạy đi 1.222px, từ mép phải về mép trái,
          đồng thời thanh cao thêm 25px và đẩy cả canvas. Tên công đoạn đổi mỗi vài giây khi
          máy chạy, nên nút tiêu tiền tự đi lại suốt phiên.
          Giờ dải số có vùng riêng và tự cắt khi hẹp; cụm nút là anh em của nó nên không có
          gì đẩy được nó nữa. */}
      <div className="dai">
      {/* `ghim` = sticky ở mép trái vùng cắt. DESIGN.md:108 đòi trạng thái máy "luôn hiện,
          không cuộn mất", và giờ dải số cuộn được nên lời hứa ấy phải thành một lớp thật.
          Luật đó nói về TRẠNG THÁI, không nói về mọi con số — nên giá, năng suất và đã chạy
          vẫn cắt được. */}
      {ket ? (
        <div className="cell ghim ket" title={`${cauLoi(ket.loi)}\n${ket.loi.tho}`}>
          <span className="ky amber" aria-hidden="true">
            ■
          </span>
          <span className="m">{LOI_LLM.dangKet.toLowerCase()}</span>
        </div>
      ) : (
        <div className="cell ghim">
          <span
            className={`ky ${may.mau}${mayChay ? ' dap' : ''}`}
            aria-hidden="true"
          >
            {may.ky}
          </span>
          <span className="m">{may.nhan}</span>
        </div>
      )}

      {/* Ô bước chỉ hiện khi đang chạy: lúc nghỉ, "bước vừa xong" là việc của lượt cũ — có
          khi từ nhiều tuần trước — và đặt nó ở đây đọc như việc đang diễn ra. */}
      {mayChay || dangChay ? (
        <div className="cell buoc" title={`${buoc ? `${buoc} — ` : ''}${chuGiaiBuoc}`}>
        <span className="lbl">{CHU.congDoan}</span>
        {buoc ? (
          <>
            <span className="m" title={buoc}>
              {loiBuoc
                ? cauLoi(loiBuoc, false)
                : (giaiCongDoan(buoc) ?? giaiDong(buoc, { ncc, coViec: false }) ?? buoc)}
            </span>
            <span className="lbl">{nhanBuoc}</span>
          </>
        ) : (
          <span className="m trong">{CHU.khongCo}</span>
        )}
      </div>
      ) : null}

      {/* Tên model không có giới hạn trên — `gemini-2.5-pro` ăn 122px nhưng
          `Writer · gemini-2.5-flash-thinking` ăn 229px. Ô này vì thế bị chặn bề
          rộng giống `.cell.buoc`, và câu đầy đủ vào `title`. Chỉ tên MODEL bị
          cắt bằng ellipsis, không phải tên vai: vai là tập đóng (Architect /
          Writer / Editor / Arbiter / Engine) nên nó không bao giờ là thứ làm
          tràn, và cắt nó đi là mất phần mang tin mà không cần thiết. */}
      {/* Model: hai câu khác nhau, hai ô khác nhau.
          `transport.model` là model của LƯỢT GẦN NHẤT đã ghi trên đĩa, còn cài đặt là model
          SẼ dùng ở lần mở phiên tới. Gộp chúng vào một ô "vai · model" là đúng chỗ người dùng
          thấy "cx/gpt-5.6-luna" ở đây trong khi cài đặt ghi "lingoreup · auto". Lúc đang chạy
          thì lượt gần nhất chính là lượt hiện tại, nên chỉ cần một ô. */}
      <div
        className="cell to"
        title={trungModel ? `${toDayDu} — ${DH.modelChungGiai}` : toDayDu || undefined}
      >
        <span className="lbl">{mayChay ? CHU.to : trungModel ? DH.modelChung : DH.luotTruoc}</span>
        {/* Lúc nghỉ, ô này chỉ trả lời "lượt trước chạy model nào" — tên vai nhường chỗ cho tên
            model (ô bị chặn bề rộng, giữ cả hai thì model bị cắt còn một ký tự) và nằm trong `title`. */}
        {vai && (mayChay || !modelLuot) ? <span>{nhanVai(vai)}</span> : null}
        {/* Lúc chạy ô này trả lời "AI nào đang làm" — tên model nhường chỗ (nằm ở `title` và ở
            cột Phiên này). Giữ cả hai thì ô ăn mất chỗ của "thời gian viết": đo được ở 1512px,
            thanh cắt còn "t…" đúng lúc đang chạy. */}
        {modelLuot && !(mayChay && vai) ? <span className="model">{modelLuot}</span> : null}
        {/* "1 phút trước" chỉ ở `title`: hiện nó cạnh tên model là ép tên model còn một ký tự
            ("lượt trước l. · 1 phút trước") — đo được ở 1512px khi cột phải mở. */}
        {!vai && !modelLuot ? <span className="trong">{CHU.khongCo}</span> : null}
      </div>
      {!mayChay && seDung && !trungModel ? (
        <div className="cell to seDung" title={DH.lanToiGiai}>
          <span className="lbl">{DH.lanToi}</span>
          <span className="model">{seDung}</span>
        </div>
      ) : null}

      {/* Thước ngữ cảnh chỉ có kim khi engine đã báo một lần nén. */}
      {/* Ô bộ nhớ chỉ hiện khi hệ thống đã báo một lần nén: trước đó nó chỉ là một thước
          rỗng cộng một dấu gạch, chiếm chỗ của bước đang làm. */}
      {nc ? (
      <div
        className="cell"
        title={nc ? `${nc.goc} — ${GIAI_THICH.nguongNen}` : GIAI_THICH.nguongNen}
      >
        <span className="lbl">{CHU.nguCanh}</span>
        <span className="ctxbar">
          {nc ? <i style={{ width: `${Math.round(nc.ti * 100)}%` }} /> : null}
        </span>
        {nc ? (
          <span className={`m${nc.ti >= 0.85 ? ' warn' : ''}`}>{phanTram(nc.ti)}</span>
        ) : (
          <span className="m trong">{CHU.khongCo}</span>
        )}
        {/* Cặp token là số liệu PHỤ của thước này: tỉ lệ phần trăm mới là thứ trả
            lời "sắp nén chưa". Dưới 1240px nó bị ẩn để transport không tràn và
            cắt mất "đã chạy" ở cuối — câu đầy đủ vẫn nằm trong chú giải của ô. */}
        {nc?.dung && nc.cua ? (
          <span className="lbl token">
            {so(nc.dung)}/{so(nc.cua)}
          </span>
        ) : null}
      </div>
      ) : null}
      <div className="cell push">
        <span className="lbl">{CHU.nangSuat}</span>
        {nangSuatSo ? (
          <span className="m">
            {nangSuatSo} {CHU.chuongMoiGio}
          </span>
        ) : (
          <span className="m trong" title={DH.phienQuaNgan}>
            {CHU.khongCo}
          </span>
        )}
      </div>

      <div className="cell">
        <span className="lbl">{CHU.giaThanh}</span>
        {donGiaSo ? (
          <span className="m">
            {donGiaSo} {CHU.moiChuong}
          </span>
        ) : (
          <span className="m trong">{CHU.khongCo}</span>
        )}
      </div>

      <div className="cell">
        <span className="lbl">{CHU.tong}</span>
        <span className="m">{tong ?? CHU.khongCo}</span>
      </div>

      <div className="cell" title={CHU.daChayGiai}>
        <span className="lbl">{CHU.daChay}</span>
        <span className="m">{chay ?? CHU.khongCo}</span>
      </div>
      </div>

      {children}
    </footer>
  );
}

/**
 * Model người viết SẼ dùng ở lượt tới: vai `writer` nếu đặt riêng, không thì mặc định.
 * Hỏi `/api/config` một lần và mỗi khi tab được nhìn lại — đổi ở màn Model & khóa API rồi
 * quay về đây thì con số phải đúng ngay.
 */
function useSeDung(): string | undefined {
  const [s, datS] = useState<string>();
  useEffect(() => {
    let huy = false;
    const hoi = () =>
      layCauHinh()
        .then((c) => {
          if (huy) return;
          const r = c.roles?.writer;
          datS(r?.provider ? `${r.provider} · ${r.model}` : c.provider ? `${c.provider} · ${c.model}` : undefined);
        })
        .catch(() => undefined);
    hoi();
    const thay = () => {
      if (document.visibilityState === 'visible') hoi();
    };
    document.addEventListener('visibilitychange', thay);
    window.addEventListener('focus', hoi);
    return () => {
      huy = true;
      document.removeEventListener('visibilitychange', thay);
      window.removeEventListener('focus', hoi);
    };
  }, []);
  return s;
}
