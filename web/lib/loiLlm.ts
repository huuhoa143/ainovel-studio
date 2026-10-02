/**
 * Dịch lỗi LLM và các dòng nội bộ của engine sang một câu người dùng đọc được.
 *
 * Engine chuyển nguyên văn lỗi của nhà cung cấp lên giao diện — `routing_exhausted: All models
 * exhausted: 388 routes checked (229 no usable key c...` — ở thẻ đang làm, thanh dưới và Diễn
 * biến. Câu đó đúng nhưng không nói được hai điều người dùng cần: chuyện gì đang xảy ra, và nên
 * làm gì. Một chỗ dịch cho mọi nơi hiện lỗi, để ba chỗ không bao giờ nói ba câu khác nhau.
 *
 * Nguyên văn KHÔNG bị bỏ: hàm trả cả `tho` để nơi gọi đặt vào `title` hoặc phần mở rộng.
 */

import { CONG_CU, LOI_LLM } from '@/lib/chu/tien-do';
import { giaiCongCu } from '@/lib/congCu';
import { nhanVai } from '@/lib/nhan';
import type { StreamEvent } from '@/lib/types';

export interface LoiDaGiai {
  /** Mã loại lỗi — để so "cùng một lỗi" mà không phụ thuộc chữ. */
  ma: string;
  /** Câu chính, không có dấu chấm cuối. */
  cau: string;
  /** Việc nên làm tiếp. */
  viec: string;
  /** Có khi lỗi đến từ một lần thử lại. */
  thuLai?: { lan: number; tong: number };
  /** Nguyên văn. */
  tho: string;
}

const THU_LAI = /^\s*Thử lại\s*\((\d+)\s*\/\s*(\d+)[^)]*\)\s*:\s*([\s\S]*)$/i;

/** Tách tiền tố "Thử lại (4/7, sau 8s): " nếu có. */
export function tachThuLai(s: string): { lan: number; tong: number; con: string } | undefined {
  const m = THU_LAI.exec(s);
  if (!m) return undefined;
  return { lan: Number(m[1]), tong: Number(m[2]), con: m[3] ?? '' };
}

/**
 * Dịch một chuỗi lỗi. Trả `undefined` nếu chuỗi không giống lỗi LLM nào — nơi gọi giữ nguyên
 * chữ cũ, vì đoán bừa một lỗi là tệ hơn để nguyên văn.
 */
export function giaiLoi(
  tho: string | undefined,
  ngu: { ncc?: string; vai?: string } = {},
): LoiDaGiai | undefined {
  if (!tho) return undefined;
  const tl = tachThuLai(tho);
  const s = (tl?.con ?? tho).toLowerCase();
  const ncc = ngu.ncc?.trim() || LOI_LLM.nccMacDinh;
  const vai = ngu.vai ? nhanVai(ngu.vai) : undefined;
  const doiModel = vai ? LOI_LLM.viecDoiModel(vai) : LOI_LLM.viecDoiModelChung;

  let ma: string;
  let cau: string;
  let viec: string;
  if (/routing_exhausted|all models exhausted|routes checked/.test(s)) {
    ma = 'het-tuyen';
    cau = /tool[- ]?calling/.test(s)
      ? LOI_LLM.khongConModelGoiCongCu(ncc)
      : LOI_LLM.khongConModel(ncc);
    viec = doiModel;
  } else if (/no candidate model|no usable (provider )?key/.test(s)) {
    ma = 'khong-khoa';
    cau = LOI_LLM.khongCoKhoa(ncc);
    viec = doiModel;
  } else if (/not in the catalog|model[_ ]not[_ ]found|unknown model|does not exist|\b404\b/.test(s)) {
    ma = 'khong-model';
    cau = LOI_LLM.khongCoModel(ncc);
    viec = doiModel;
  } else if (/\b401\b|unauthori[sz]ed|invalid[_ ]api[_ ]key|incorrect api key|authentication/.test(s)) {
    ma = 'khoa-sai';
    cau = LOI_LLM.khoaBiTuChoi(ncc);
    viec = LOI_LLM.viecKiemKhoa;
  } else if (/\b403\b|forbidden|permission denied/.test(s)) {
    ma = 'cam';
    cau = LOI_LLM.tuChoiTruyCap(ncc);
    viec = LOI_LLM.viecKiemKhoa;
  } else if (/\b429\b|rate[_ ]?limit|too many requests|quota/.test(s)) {
    ma = 'gioi-han';
    cau = LOI_LLM.gioiHanLuot(ncc);
    viec = LOI_LLM.viecCho;
  } else if (/timeout|timed out|deadline exceeded/.test(s)) {
    ma = 'qua-lau';
    cau = LOI_LLM.quaLau(ncc);
    viec = LOI_LLM.viecCho;
  } else if (/\b5\d\d\b|internal server error|bad gateway|service unavailable|overloaded/.test(s)) {
    // Cloudflare trả nguyên một khối JSON/HTML ("Error 502: Bad gateway", 520–524). Đó là lỗi
    // TẠM THỜI của cổng, thường tự hết sau một lần thử lại — nói đúng số mã, không đổ cho model.
    ma = 'may-chu';
    const so = /\b(5\d\d)\b/.exec(s)?.[1] ?? (/bad gateway/.test(s) ? '502' : undefined);
    cau = so ? LOI_LLM.congTamLoi(ncc, so) : LOI_LLM.loiMayChu(ncc);
    viec = LOI_LLM.viecCho;
  } else if (/connection refused|no such host|dial tcp|connection reset|eof\b/.test(s)) {
    ma = 'mang';
    cau = LOI_LLM.khongKetNoi(ncc);
    viec = LOI_LLM.viecKiemMang;
  } else if (tl) {
    // Một lần thử lại mà lý do lạ: vẫn là lỗi của lượt gọi, chỉ không đọc ra loại.
    ma = 'khac';
    cau = LOI_LLM.loiKhac(ncc);
    viec = doiModel;
  } else {
    return undefined;
  }
  return { ma, cau, viec, thuLai: tl ? { lan: tl.lan, tong: tl.tong } : undefined, tho };
}

/** "lingoreup không còn model nào gọi công cụ được (đang thử lại 4/7). Thử chọn model khác…" */
export function cauLoi(l: LoiDaGiai, coViec = true): string {
  const tl = l.thuLai ? ` (${LOI_LLM.dangThuLai(l.thuLai.lan, l.thuLai.tong)})` : '';
  return coViec ? `${l.cau}${tl}. ${l.viec}` : `${l.cau}${tl}`;
}

const GIAO_VIEC_MUI_TEN = /^\s*([\w-]+)\s*(?:→|->)\s*([\w-]+)(?:\s*\(([\s\S]*)\))?\s*$/;
const GIAO_VIEC_NGOAC = /^\s*([\w-]+)\s*\(([\s\S]*)\)\s*$/;

/**
 * Dòng giao việc nội bộ → câu.
 *
 * `engine → architect_short (Hãy xây dựng…)` (việc của vai) và `architect_short (Hãy…)` (tóm
 * tắt sự kiện DISPATCH). Bên giao là `engine` thì người dùng thấy đó là Điều phối — engine chỉ
 * là kênh, quyết định giao việc là của Điều phối.
 */
export function giaiGiaoViec(tho: string | undefined): string | undefined {
  if (!tho) return undefined;
  const m = GIAO_VIEC_MUI_TEN.exec(tho);
  if (m) {
    const tu = m[1] === 'engine' ? nhanVai('arbiter') : nhanVai(m[1]!);
    // "writer → novel_context" KHÔNG phải giao việc: bên phải là một công cụ, không phải một
    // vai. Đọc nó thành "Người viết giao việc cho novel_context" là nói một vai giao việc cho
    // một cái hàm — đúng câu đã thấy trên truyện thật.
    if (nhanVai(m[2]!) === m[2]) {
      const viec = giaiCongCu(m[2]!);
      return viec ? CONG_CU.vaiLam(tu, viec) : undefined;
    }
    return LOI_LLM.giaoViec(tu, nhanVai(m[2]!));
  }
  const n = GIAO_VIEC_NGOAC.exec(tho);
  if (n && nhanVai(n[1]!) !== n[1]) return LOI_LLM.giaoViecCho(nhanVai(n[1]!));
  return undefined;
}

/**
 * MỘT câu cho mọi dòng nội bộ của engine: lỗi → câu lỗi, giao việc → câu giao việc, công cụ →
 * việc. `undefined` khi không nhận ra — nơi gọi giữ nguyên văn (và luôn đặt nguyên văn vào
 * `title`). Thẻ đang làm, ô bước ở thanh dưới và Diễn biến đều đi qua đây.
 */
export function giaiDong(
  tho: string | undefined,
  ngu: { ncc?: string; vai?: string; coViec?: boolean } = {},
): string | undefined {
  if (!tho) return undefined;
  const loi = giaiLoi(tho, ngu);
  if (loi) return cauLoi(loi, ngu.coViec ?? true);
  return giaiGiaoViec(tho) ?? giaiCongCu(tho);
}

/* ── Diễn biến: sắp xếp, gộp, phát hiện kẹt ─────────────────────────── */

function mocGio(ev: StreamEvent): number {
  const t = Date.parse(ev.time);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Mới nhất trước, theo GIỜ — không theo `seq`.
 *
 * Danh sách được nối theo thứ tự đến (seq), và một sự kiện cũ phát lại khi tiếp tục phiên có
 * seq mới mà giờ cũ: đo được trên truyện thật, dòng "giao việc 09:07" nằm chen giữa 09:10 và
 * 09:09. Cùng giờ thì seq lớn hơn đứng trước.
 */
export function sapSuKien(ds: readonly StreamEvent[]): StreamEvent[] {
  return [...ds].sort((a, b) => mocGio(b) - mocGio(a) || b.seq - a.seq);
}

export interface DongSuKienGop {
  ev: StreamEvent;
  /** Số sự kiện được gộp vào dòng này (1 = không gộp). */
  so: number;
  /** Lỗi đã dịch, nếu dòng là lỗi/thử lại. */
  loi?: LoiDaGiai;
  /**
   * Lỗi ĐÃ QUA: sau nó còn có tiến triển (một công cụ chạy, một lần giao việc). Lỗi thoáng qua
   * như 502 của cổng mà vẫn tô đỏ kèm "thử chọn model khác" là báo động giả — truyện vẫn chạy.
   */
  daQua?: boolean;
}

/** Sự kiện cho thấy máy vừa làm được việc — công cụ chạy hoặc giao việc, không phải lỗi. */
function laTienTrien(ev: StreamEvent): boolean {
  const loai = (ev.category ?? ev.kind ?? '').toUpperCase();
  if (loai !== 'TOOL' && loai !== 'DISPATCH') return false;
  return !giaiLoi(ev.summary);
}

/**
 * Gộp các lần thử lại LIỀN NHAU của cùng một lỗi thành một dòng. Bảy dòng "Thử lại (n/7): …"
 * giống hệt nhau chỉ đẩy mọi thứ khác ra khỏi khung; một dòng "Thử lại 7 lần — …" nói đủ.
 */
export function gopSuKien(
  ds: readonly StreamEvent[],
  ngu: { ncc?: string } = {},
): DongSuKienGop[] {
  const ra: DongSuKienGop[] = [];
  // Đi từ mới tới cũ: đã gặp tiến triển nào MỚI HƠN thì mọi lỗi phía sau đều đã qua.
  let coTienTrien = false;
  for (const ev of sapSuKien(ds)) {
    if (laTienTrien(ev)) coTienTrien = true;
    const tl = ev.summary ? tachThuLai(ev.summary) : undefined;
    const loi = giaiLoi(ev.summary, { ncc: ngu.ncc, vai: ev.agent });
    const truoc = ra[ra.length - 1];
    if (
      tl &&
      loi &&
      truoc?.loi?.thuLai &&
      truoc.loi.ma === loi.ma &&
      (truoc.ev.agent ?? '') === (ev.agent ?? '')
    ) {
      truoc.so += 1;
      continue;
    }
    ra.push({ ev, so: 1, loi, daQua: loi ? coTienTrien : undefined });
  }
  return ra;
}

export interface TinhTrangKet {
  loi: LoiDaGiai;
  vai?: string;
}

/**
 * Engine có đang KẸT không: các sự kiện mới nhất toàn là thử lại cùng một lỗi, kéo dài qua ít
 * nhất hai vòng thử lại (engine hết 7/7 thì quay lại 1/7 — vòng lặp không tự dừng) hoặc ít nhất
 * `nguongMs`, mà không có sự kiện nào khác chen vào.
 *
 * Chỉ dùng dữ liệu đã có (dòng sự kiện) — không cần engine báo thêm. Có một sự kiện không phải
 * thử lại mới hơn là đủ để coi như hết kẹt.
 */
export function phatHienKet(
  ds: readonly StreamEvent[],
  ngu: { ncc?: string; nguongMs?: number } = {},
): TinhTrangKet | undefined {
  const nguong = ngu.nguongMs ?? 90_000;
  const sap = sapSuKien(ds);
  const dau = sap[0];
  if (!dau?.summary) return undefined;
  const tlDau = tachThuLai(dau.summary);
  const loiDau = giaiLoi(dau.summary, { ncc: ngu.ncc, vai: dau.agent });
  if (!tlDau || !loiDau) return undefined;

  let vong = 1;
  let lanTruoc = tlDau.lan;
  let cuNhat = dau;
  for (const ev of sap.slice(1)) {
    const tl = ev.summary ? tachThuLai(ev.summary) : undefined;
    if (!tl) break;
    const l = giaiLoi(ev.summary, { ncc: ngu.ncc, vai: ev.agent });
    if (!l || l.ma !== loiDau.ma) break;
    // Đi lùi thời gian: số lần thử phải GIẢM; thấy nó tăng lại là vừa bước qua một vòng.
    if (tl.lan >= lanTruoc) vong += 1;
    lanTruoc = tl.lan;
    cuNhat = ev;
  }
  const keoDai = mocGio(dau) - mocGio(cuNhat);
  if (vong >= 2 || keoDai >= nguong) return { loi: loiDau, vai: dau.agent };
  return undefined;
}
