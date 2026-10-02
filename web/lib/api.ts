/**
 * Tầng gọi API. Một chỗ duy nhất biết địa chỉ và biết chế độ mock.
 *
 * Hai cách chạy:
 *
 *   1. Sau `npm run build`, thư mục `out/` được engine phục vụ:
 *        ainovel-cli serve --root <gốc> --web web/out
 *      Cùng gốc (origin) nên `/api/...` chạy trực tiếp, không cần CORS.
 *
 *   2. `npm run dev` proxy `/api` sang engine qua rewrites trong
 *      next.config.mjs — cũng thành cùng gốc, vì server Go không gửi header
 *      CORS và EventSource không thể tự vượt qua điều đó.
 *
 *   3. `npm run dev:mock` không cần engine: đọc fixtures trong web/fixtures.
 */

import type {
  CastDoc,
  ChapterDetail,
  CauHinhDoc,
  CostDoc,
  DapCungDung,
  KetQuaLuongTep,
  LuotCungDung,
  MucVai,
  OutlineDoc,
  Profile,
  SettingsDoc,
  Snapshot,
  StreamEvent,
  StyleDoc,
  TinhTrangNguon,
  TongXuongDoc,
  TrangThaiSong,
  VaiModelDoc,
  Workshop,
  WorldDoc,
} from './types';

/** '1' = fixture đầy đủ; 'empty' = xưởng rỗng; rỗng/undefined = gọi engine thật. */
const MOCK = process.env.NEXT_PUBLIC_MOCK ?? '';
export const LA_MOCK = MOCK !== '';

const GOC = process.env.NEXT_PUBLIC_API_BASE ?? '';

/**
 * Các `event:` mà server có thể gửi (internal/domain/runtime_events.go), tách làm HAI nhóm
 * vì chúng đi hai đường KHÁC NHAU trong `useStudio`.
 *
 * Gộp làm một danh sách là lỗi đã đo: handler của đường ui đòi trường `seq`, mà payload văn
 * sống không có nó — xem chú thích của `nhanSuKienUi` trong lib/dongSuKien.ts.
 *
 * Hai nhịp cũng khác nhau, và đó là thiết kế chứ không phải thiếu sót: `ui_event` nhảy khoảng
 * 5 lần trong 18 giây nên vòng dò 700ms là đủ; `stream_delta` có nhịp trung vị 2ms nên nó
 * được ĐÁNH THỨC ở phía server. Hạ vòng dò chung xuống cho khớp delta là nghiền đĩa vì một
 * dòng gần như im.
 */
export const LOAI_SU_KIEN_UI = ['ui_event', 'control'] as const;
export const LOAI_VAN_SONG = ['stream_delta', 'stream_clear'] as const;
export const LOAI_SU_KIEN = [...LOAI_SU_KIEN_UI, ...LOAI_VAN_SONG] as const;

export class LoiApi extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'LoiApi';
    this.status = status;
  }
}

async function doc<T>(duong: string): Promise<T> {
  const res = await fetch(`${GOC}${duong}`, { cache: 'no-store' });
  if (!res.ok) {
    // writeErr trả {"error": "..."} — dùng câu của server, nó nói tiếng Việt
    // và biết rõ hơn giao diện chuyện gì đã xảy ra.
    let thongDiep = `HTTP ${res.status}`;
    try {
      const than = (await res.json()) as { error?: string };
      if (than?.error) thongDiep = than.error;
    } catch {
      /* thân không phải JSON — giữ mã trạng thái */
    }
    throw new LoiApi(thongDiep, res.status);
  }
  return (await res.json()) as T;
}

/* ── mock ──────────────────────────────────────────────────────────────── */

async function mockWorkshop(): Promise<Workshop> {
  if (MOCK === 'empty') {
    return (await import('../fixtures/workshop-empty.json')).default as Workshop;
  }
  return (await import('../fixtures/workshop.json')).default as Workshop;
}

async function mockStudio(book: string): Promise<Snapshot> {
  switch (book) {
    case 'mot-dem-khong-ten':
      return (await import('../fixtures/studio-mot-dem.json')).default as unknown as Snapshot;
    case 'bien-ky':
      return (await import('../fixtures/studio-bien-ky.json')).default as unknown as Snapshot;
    default:
      return (await import('../fixtures/studio-tran-yeu-ky.json')).default as unknown as Snapshot;
  }
}

/* ── endpoint ──────────────────────────────────────────────────────────── */

export function layWorkshop(): Promise<Workshop> {
  if (LA_MOCK) return mockWorkshop();
  return doc<Workshop>('/api/workshop');
}

export async function laySnapshot(book: string, chuong?: number): Promise<Snapshot> {
  if (LA_MOCK) {
    const snap = await mockStudio(book);
    // Fixture chứa `selected` cố định; mô phỏng ?chapter= bằng cách bỏ selection
    // khi người dùng chọn chương khác, để giao diện phải xử lý ca "chưa có dữ
    // liệu cho chương này" thật chứ không luôn được cho sẵn.
    if (chuong && snap.selected && snap.selected.chapter !== chuong) {
      return { ...snap, selected: { chapter: chuong } };
    }
    return snap;
  }
  const q = chuong ? `?chapter=${chuong}` : '';
  return doc<Snapshot>(`/api/books/${encodeURIComponent(book)}/studio${q}`);
}

export async function layChuong(book: string, n: number): Promise<ChapterDetail> {
  if (LA_MOCK) {
    const mau = (await import('../fixtures/chapter.json')).default as unknown as ChapterDetail;
    return { ...mau, chapter: n };
  }
  return doc<ChapterDetail>(`/api/books/${encodeURIComponent(book)}/chapters/${n}`);
}

/**
 * Đếm cho rail: nhân vật, luật thế giới, phục bút.
 *
 * Ba endpoint này trả `null` khi store chưa có mục nào — và null KHÁC 0 ở đây:
 * null nghĩa là chưa dựng nền tác phẩm, 0 nghĩa là đã dựng mà rỗng. Rail hiện
 * số khi có mảng, không hiện gì khi null. Lỗi mạng ở đây không được làm sập
 * bề mặt chính nên mỗi lời gọi tự nuốt lỗi thành null.
 */
export async function layHoSo(book: string): Promise<Profile> {
  if (LA_MOCK) {
    const nguon = nguonMock(book);
    if (MOCK === 'empty' || book === 'bien-ky') {
      return { characters: null, rules: null, foreshadow: null, ...nguon };
    }
    return { characters: 18, rules: 31, foreshadow: 4, ...nguon };
  }

  const dem = (v: unknown): number | null => (Array.isArray(v) ? v.length : null);
  const goi = async <T>(duong: string): Promise<T | null> => {
    try {
      return await doc<T>(duong);
    } catch {
      return null;
    }
  };

  const b = encodeURIComponent(book);
  const [cast, world, vanPhong, chiPhi, caiDat] = await Promise.all([
    goi<{ characters: unknown }>(`/api/books/${b}/cast`),
    goi<{ rules: unknown; foreshadow: unknown }>(`/api/books/${b}/world`),
    hoiTham<StyleDoc>(`/api/books/${b}/style`, coVanPhong),
    hoiTham<CostDoc>(`/api/books/${b}/cost`, coChiPhi),
    hoiTham<SettingsDoc>(`/api/books/${b}/settings`, coCaiDat),
  ]);

  return {
    characters: cast ? dem(cast.characters) : null,
    rules: world ? dem(world.rules) : null,
    foreshadow: world ? dem(world.foreshadow) : null,
    vanPhong,
    chiPhi,
    caiDat,
  };
}

/**
 * Hỏi thăm một endpoint để rail biết vẽ nút hay vẽ nhãn "chưa dựng".
 *
 * # Vì sao hỏi thăm chứ không đọc `capabilities`
 *
 * Ba cờ trong `capabilities` trả lời "store CÓ dữ liệu không", không trả lời
 * "engine này CÓ endpoint không". Hai câu đó khác nhau ở đúng ca hay gặp nhất:
 * tác phẩm mới chưa có meta/usage.json thì cờ là false trong khi bề mặt Chi phí
 * đã dựng và có câu tử tế để nói về chuyện đó. Gate rail theo cờ sẽ ẩn bề mặt
 * đúng lúc nó cần lên tiếng.
 *
 * # Vì sao 404 là "thiếu endpoint"
 *
 * Ba endpoint hồ sơ sẵn có (`/outline`, `/cast`, `/world`) LUÔN trả 200 kèm
 * `null` khi tệp không tồn tại — xem handleCast/handleWorld trong
 * internal/serve/serve.go, chúng bỏ qua lỗi đọc và ghi thẳng nil vào JSON. Ba
 * endpoint mới theo cùng quy ước đó, nên 404 chỉ còn một nghĩa: bản engine đang
 * chạy không có route này.
 *
 * Nếu quy ước đó đổi (endpoint 404 khi thiếu tệp) thì hàm này sẽ báo "chưa dựng"
 * cho một bề mặt đã dựng — hướng sai an toàn hơn hướng ngược lại, nhưng vẫn sai,
 * nên nó được ghi ra đây thay vì để người sau tự tìm.
 *
 * Lỗi KHÁC 404 (500, store đọc lỗi, mạng đứt) không kết luận gì về endpoint, nên
 * rail vẫn vẽ nút và bề mặt tự hiện câu lỗi của server. Nuốt nó thành "chưa
 * dựng" là biến một lỗi tầng đọc thành một sự thật về engine.
 */
async function hoiTham<T>(
  duong: string,
  coDuLieu: (d: T) => boolean,
): Promise<TinhTrangNguon> {
  try {
    const d = await doc<T>(duong);
    return coDuLieu(d) ? 'co-nguon' : 'co-route';
  } catch (e) {
    if (e instanceof LoiApi && e.status === 404) return 'thieu-endpoint';
    return 'co-route';
  }
}

/**
 * Văn phong "có nguồn" khi có ít nhất một luật thật ở MỘT TRONG HAI nguồn.
 *
 * Phải đọc qua `arc_style`/`user_rules`, không đọc phẳng: bản trước viết
 * `d.prose` — một trường KHÔNG tồn tại trên payload, nên hàm luôn trả `false` và
 * rail báo "chưa có nguồn" cả khi store có đủ luật. TypeScript không bắt được vì
 * `StyleDoc` khi đó cũng mô tả sai hình dạng, nên hai cái sai khớp nhau.
 *
 * Kiểm cả hai nguồn, không chỉ `arc_style`: `user_rules` có ngay từ lúc mở sách
 * còn `arc_style` chỉ có sau biên cung đầu tiên. Chỉ kiểm nguồn thứ nhất là dán
 * nhãn "chưa có số liệu" lên suốt cả cung đầu của mọi tác phẩm.
 */
const coVanPhong = (d: StyleDoc): boolean => {
  const a = d.arc_style;
  const u = d.user_rules;
  return (
    (a?.prose?.length ?? 0) > 0 ||
    (a?.dialogue?.length ?? 0) > 0 ||
    (a?.taboos?.length ?? 0) > 0 ||
    (u?.forbidden_phrases?.length ?? 0) > 0 ||
    (u?.forbidden_chars?.length ?? 0) > 0 ||
    Object.keys(u?.fatigue_words ?? {}).length > 0 ||
    !!u?.preferences
  );
};

/**
 * Chi phí "có nguồn" khi store đã cộng được một lượt gọi nào.
 *
 * KHÔNG kiểm `cost_usd > 0`: một phiên chạy trên model miễn phí có usage thật mà
 * chi phí đúng bằng 0, và đó là dữ liệu, không phải trống. Nên phép kiểm nhìn vào
 * số token — thứ luôn tăng khi có một lượt gọi thật.
 */
const coChiPhi = (d: CostDoc): boolean =>
  Object.keys(d.per_agent ?? {}).length > 0 ||
  Object.keys(d.per_model ?? {}).length > 0 ||
  (d.overall?.input ?? 0) > 0 ||
  (d.overall?.output ?? 0) > 0;

const coCaiDat = (d: SettingsDoc): boolean =>
  !!(d.started_at || d.model || d.provider || d.style);

/**
 * Ba tác phẩm mẫu được chia đúng ba trạng thái nguồn, để chế độ mock dựng được
 * cả ba mà không cần engine:
 *
 *   tran-yeu-ky       → có dữ liệu
 *   mot-dem-khong-ten → endpoint có, tệp có mà rỗng
 *   bien-ky           → endpoint có, store chưa ghi tệp nào
 *
 * Không có tác phẩm mẫu nào cho ca "endpoint thiếu": ca đó dựng được bằng chính
 * bản thật (bản engine chưa có route sẽ trả 404), nên bịa thêm một tác phẩm giả
 * cho nó là dựng một ca đã có thật.
 */
function nguonMock(book: string): Pick<Profile, 'vanPhong' | 'chiPhi' | 'caiDat'> {
  const tt: TinhTrangNguon = book === 'tran-yeu-ky' ? 'co-nguon' : 'co-route';
  return { vanPhong: tt, chiPhi: tt, caiDat: tt };
}

/* ── hồ sơ tác phẩm ────────────────────────────────────────────────────── */

/**
 * Ba endpoint hồ sơ. KHÔNG nuốt lỗi ở đây, khác với `layHoSo`.
 *
 * `layHoSo` nuốt lỗi vì nó chỉ tô số đếm cho rail và một lỗi mạng ở đó không
 * được làm sập bề mặt chính. Còn ba hàm này là nguồn duy nhất của cả một bề
 * mặt: nuốt lỗi thành `null` sẽ biến "không đọc được store" thành "tác phẩm
 * chưa có nhân vật nào" — hai câu khác nhau, và câu sau là nói dối.
 */
export function layDanY(book: string): Promise<OutlineDoc> {
  if (LA_MOCK) return mockJson<OutlineDoc>('outline');
  return doc<OutlineDoc>(`/api/books/${encodeURIComponent(book)}/outline`);
}

export function layNhanVat(book: string): Promise<CastDoc> {
  if (LA_MOCK) return mockJson<CastDoc>('cast');
  return doc<CastDoc>(`/api/books/${encodeURIComponent(book)}/cast`);
}

export function layTheGioi(book: string): Promise<WorldDoc> {
  if (LA_MOCK) return mockJson<WorldDoc>('world');
  return doc<WorldDoc>(`/api/books/${encodeURIComponent(book)}/world`);
}

/* ── ba bề mặt xưởng: văn phong · chi phí · cài đặt ─────────────────────── */

/**
 * Cùng luật với ba hàm hồ sơ ngay trên: KHÔNG nuốt lỗi.
 *
 * Ba bề mặt này phải phân biệt được ba ca — store chưa ghi tệp / tệp có mà rỗng /
 * không đọc được — và nuốt lỗi thành hồ sơ rỗng sẽ gộp ca thứ ba vào ca thứ nhất.
 * Đó là biến một lỗi của tầng đọc thành một sự thật về tác phẩm, và không ai đi
 * kiểm lại một câu như thế.
 */
export function layVanPhong(book: string): Promise<StyleDoc> {
  if (LA_MOCK) return mockXuong<StyleDoc>('style', book);
  return doc<StyleDoc>(`/api/books/${encodeURIComponent(book)}/style`);
}

export function layChiPhi(book: string): Promise<CostDoc> {
  if (LA_MOCK) return mockXuong<CostDoc>('cost', book);
  return doc<CostDoc>(`/api/books/${encodeURIComponent(book)}/cost`);
}

export function layCaiDat(book: string): Promise<SettingsDoc> {
  if (LA_MOCK) return mockXuong<SettingsDoc>('settings', book);
  return doc<SettingsDoc>(`/api/books/${encodeURIComponent(book)}/settings`);
}

/**
 * Fixture ba bề mặt xưởng, chia theo tác phẩm để mock dựng được cả ba trạng thái
 * rỗng. Xem `nguonMock` để biết tác phẩm nào mang trạng thái nào.
 *
 * Hai hình dạng rỗng ở đây KHÔNG giống nhau, và đó là điểm chính:
 *   - `bien-ky` trả mọi mảng `null` — store chưa ghi tệp nào
 *   - `mot-dem-khong-ten` trả mảng `[]` và số `0` — tệp có, trong đó rỗng
 */
async function mockXuong<T>(
  ten: 'style' | 'cost' | 'settings',
  book: string,
): Promise<T> {
  if (book === 'tran-yeu-ky') {
    switch (ten) {
      case 'style':
        return (await import('../fixtures/style.json')).default as unknown as T;
      case 'cost':
        return (await import('../fixtures/cost.json')).default as unknown as T;
      default:
        return (await import('../fixtures/settings.json')).default as unknown as T;
    }
  }

  const chuaGhi = MOCK === 'empty' || book === 'bien-ky';
  switch (ten) {
    case 'style':
      // Hai nguồn tách riêng, và ca `chuaGhi` để CẢ HAI null. Ca còn lại dựng
      // đúng hình hay gặp nhất trong thực tế: `user_rules` đã có (sách đã mở qua
      // Host) mà `arc_style` chưa (chưa qua biên cung nào) — tức bề mặt phải hiện
      // được nửa này và nói rõ nửa kia chưa tới lượt.
      return (
        chuaGhi
          ? { arc_style: null, user_rules: null, warnings: null }
          : {
              arc_style: null,
              user_rules: {
                status: 'ready',
                genre: '',
                forbidden_phrases: [],
                forbidden_chars: [],
                fatigue_words: null,
                preferences: '',
                declared_by: ['system_defaults'],
                uncertain: null,
              },
              warnings: null,
            }
      ) as T;
    case 'cost': {
      const khong = {
        input: 0,
        output: 0,
        cache_read: 0,
        cache_write: 0,
        cost_usd: 0,
        saved_usd: 0,
        cache_capable: false,
        cache_breaks: 0,
      };
      return (
        chuaGhi
          ? {
              state: 'no_file',
              updated_at: '',
              overall: khong,
              per_agent: null,
              per_model: null,
              missing_assistant_usage: 0,
            }
          : {
              state: 'empty',
              updated_at: '2026-07-29T20:14:52Z',
              overall: khong,
              per_agent: {},
              per_model: {},
              missing_assistant_usage: 0,
            }
      ) as T;
    }
    default:
      return (
        chuaGhi
          ? {
              state: 'no_file',
              writable: false,
              started_at: '',
              provider: '',
              model: '',
              style: '',
              planning_tier: '',
              advance_mode: '',
              advance_permit_chapter: 0,
              advance_hold: null,
              pending_steer: '',
              start_prompt: '',
              plan_start: null,
            }
          : {
              state: 'ready',
              writable: false,
              started_at: '2026-07-29T18:02:11Z',
              provider: '',
              model: '',
              style: '',
              planning_tier: '',
              advance_mode: 'auto',
              advance_permit_chapter: 0,
              advance_hold: null,
              pending_steer: '',
              start_prompt: '',
              plan_start: null,
            }
      ) as T;
  }
}

/**
 * Fixture cho chế độ mock. Thiếu tệp thì trả về hồ sơ TRỐNG đúng hình dạng
 * server (mọi mảng `null`) thay vì ném lỗi: mock là để thử bố cục, và ca "store
 * chưa có gì" cũng là một bố cục cần thử.
 */
async function mockJson<T>(ten: 'outline' | 'cast' | 'world'): Promise<T> {
  switch (ten) {
    case 'outline':
      return (await import('../fixtures/outline.json')).default as unknown as T;
    case 'cast':
      return (await import('../fixtures/cast.json')).default as unknown as T;
    default:
      return (await import('../fixtures/world.json')).default as unknown as T;
  }
}

/* ── dòng sự kiện ──────────────────────────────────────────────────────── */

export function duongSuKien(book: string, sau: number): string {
  return `${GOC}/api/books/${encodeURIComponent(book)}/events?after=${sau}`;
}

/**
 * Dòng sự kiện giả cho chế độ mock: phát lại fixtures/events.json theo nhịp,
 * đủ để thấy transport đổi và nhật ký chạy mà không cần engine.
 *
 * Chỉ hiện thực phần EventSource mà useStudio dùng.
 */
export class DongGia {
  private hen: ReturnType<typeof setTimeout> | undefined;
  private nghe = new Map<string, (ev: MessageEvent) => void>();
  private dong = false;

  constructor(private readonly nhipMs = 2600) {
    void this.batDau();
  }

  private async batDau() {
    const mau = (await import('../fixtures/events.json')).default as StreamEvent[];
    if (this.dong) return;
    let i = 0;
    const day = () => {
      if (this.dong) return;
      const goc = mau[i % mau.length]!;
      // Seq và thời gian phải tiến lên, nếu không giao diện sẽ coi là trùng.
      const ev: StreamEvent = {
        ...goc,
        seq: goc.seq + Math.floor(i / mau.length) * mau.length,
        time: new Date().toISOString(),
      };
      i += 1;
      this.nghe.get(ev.kind)?.(
        new MessageEvent(ev.kind, { data: JSON.stringify(ev), lastEventId: String(ev.seq) }),
      );
      this.hen = setTimeout(day, this.nhipMs);
    };
    this.hen = setTimeout(day, 900);
  }

  addEventListener(loai: string, fn: (ev: MessageEvent) => void) {
    this.nghe.set(loai, fn);
  }

  close() {
    this.dong = true;
    if (this.hen) clearTimeout(this.hen);
  }
}

/* ── đường GHI ─────────────────────────────────────────────────────────── */

/**
 * Header rào mà MỌI yêu cầu ghi phải mang.
 *
 * Server đòi nó (`tenHeaderRao` trong internal/serve/rao.go) và đó là hàng rào chống
 * CSRF sang localhost: form HTML không đặt được header tùy ý, và `fetch` khác gốc mang
 * header lạ sẽ bị trình duyệt buộc preflight rồi tự chặn.
 *
 * Đặt ở ĐÂY, một chỗ. Rải nó vào từng component là bảo đảm sẽ có một chỗ quên, và chỗ
 * quên đó hỏng theo kiểu khó tìm: 403 với một câu lỗi nói về bảo mật trong khi người
 * dùng chỉ vừa bấm Lưu.
 */
const HEADER_RAO = { 'X-Ainovel-Studio': '1', 'Content-Type': 'application/json' };

/** GET nhưng phải mang header rào — dùng cho GET có tác dụng phụ. */
async function ghiDoc<T>(duong: string): Promise<T> {
  return ghi(duong, 'GET');
}

async function ghi<T>(
  duong: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  than?: unknown,
): Promise<T> {
  const res = await fetch(`${GOC}${duong}`, {
    method,
    headers: HEADER_RAO,
    body: method === 'GET' ? undefined : than === undefined ? '{}' : JSON.stringify(than),
    cache: 'no-store',
  });
  if (!res.ok) {
    let thongDiep = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) thongDiep = b.error;
    } catch {
      /* thân không phải JSON */
    }
    throw new LoiApi(thongDiep, res.status);
  }
  return (await res.json()) as T;
}

/* ── cấu hình ứng dụng ─────────────────────────────────────────────────── */

/**
 * Đọc cấu hình. Mock trả một hình dạng ĐÃ CÀI để bố cục dựng được mà không cần engine;
 * ca `needs_setup` dựng bằng engine thật (xóa config rồi mở web), vì bịa nó ở mock sẽ
 * làm chế độ mock không vào được studio.
 */
export function layCauHinh(): Promise<CauHinhDoc> {
  if (LA_MOCK) {
    return Promise.resolve({
      needs_setup: false,
      path: '~/.ainovel/config.json',
      provider: 'openrouter',
      model: 'gemini-2.5-pro',
      reasoning_effort: 'medium',
      style: 'default',
      styles: ['default', 'fantasy', 'romance', 'suspense'],
      role_names: ['default', 'architect', 'writer', 'editor'],
      providers: [
        {
          name: 'openrouter',
          type: 'openai',
          base_url: 'https://openrouter.ai/api/v1',
          api_key_set: true,
          api_key_masked: 'sk-o…9f2',
          models: [{ name: 'gemini-2.5-pro', context_window: 1000000 }],
        },
      ],
      presets: [{ name: 'openrouter', label: 'OpenRouter', type: 'openai' }],
      engine_open: [],
    });
  }
  return doc<CauHinhDoc>('/api/config');
}

/** Thân PUT /api/config. Trường vắng = KHÔNG đổi; xem chú thích `thanCauHinh` phía Go. */
export interface SuaCauHinh {
  provider?: string;
  model?: string;
  reasoning_effort?: string;
  style?: string;
  provider_config?: {
    name: string;
    /** Vắng = giữ giao thức. Chuỗi rỗng = suy giao thức theo tên (mục do TUI tạo). */
    type?: string;
    base_url?: string;
    /** Vắng = giữ khóa cũ. Chuỗi rỗng = xóa khóa. Hai nghĩa khác nhau. */
    api_key?: string;
    models?: { name: string; context_window?: number }[];
  };
  remove_provider?: string;
  /**
   * Model mặc định theo vai, áp cho MỌI lượt chạy sau.
   *
   * Gửi map là THAY CẢ MAP, không trộn từng khóa: một vai vắng mặt nghĩa là "thừa hưởng
   * mặc định", nên trộn thì thêm được mà không bao giờ gỡ được. Map rỗng = gỡ hết ghi đè.
   * Vắng trường này = không nói gì về vai. Xem `thanCauHinh.Roles` phía Go.
   */
  roles?: Record<string, MucVai>;
}

export function luuCauHinh(
  sua: SuaCauHinh,
): Promise<{ saved: boolean; path: string; reopen_to_apply: string[] }> {
  return ghi('/api/config', 'PUT', sua);
}

/**
 * Tổng của cả xưởng — GET /api/workshop/cost.
 *
 * KHÔNG có nhánh mock: `web/fixtures/` không tồn tại trong cây này (`npm run dev:mock` đã
 * hỏng từ trước bản này vì đúng lý do đó), nên một nhánh mock ở đây là mã chết trông như
 * mã sống. Ai dựng lại bộ fixture thì thêm nhánh cùng lúc.
 */
export function layTongXuong(): Promise<TongXuongDoc> {
  return doc<TongXuongDoc>('/api/workshop/cost');
}

/* ── model theo vai ────────────────────────────────────────────────────── */

export function layVaiModel(book: string): Promise<VaiModelDoc> {
  return doc<VaiModelDoc>(`/api/books/${encodeURIComponent(book)}/models`);
}

export function doiVaiModel(
  book: string,
  sua: { role: string; provider?: string; model?: string; thinking?: string },
): Promise<{ applied: string[] }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/models`, 'PUT', sua);
}

/* ── vòng đời engine ───────────────────────────────────────────────────── */

/**
 * Mở engine cho một cuốn mà KHÔNG chạy.
 *
 * Tách khỏi `chaySach` có chủ đích: gắn engine không gọi LLM lần nào (chỉ dựng model set,
 * đọc store, lấy khóa tệp), còn chạy thì tiêu tiền thật. Gộp hai việc lại thì mọi thao tác
 * đòi engine đang mở — đổi model theo vai, cấp phép chương — đều phải trả giá một lượt
 * chạy, và với cuốn đang đứng ở biên cung thì "chạy tiếp" nghĩa là mở cả một cung.
 */
export function moMay(book: string): Promise<{ book: string; dir: string; running: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/open`, 'POST');
}

export function dongMay(book: string): Promise<{ closed: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/close`, 'POST');
}

export function chaySach(book: string): Promise<{ book: string; resumed: string; state: string }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/run`, 'POST');
}

export function dungSach(book: string): Promise<{ aborted: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/abort`, 'POST');
}

/**
 * Gửi một câu của người vận hành vào dây chuyền.
 *
 * Một hàm cho cả ba việc (can thiệp khi đang chạy / đánh thức khi đã dừng / yêu cầu sau
 * khi xong) vì server tự chọn theo trạng thái engine, đúng như TUI dùng một ô nhập cho cả
 * ba. `applied` cho biết việc nào đã xảy ra để giao diện nói đúng thay vì đoán.
 */
export function canThiep(book: string, text: string): Promise<{ applied: 'steer' | 'continue' }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/steer`, 'POST', { text });
}

export function taoSach(
  id: string,
  prompt: string,
): Promise<{ book: string; dir: string; state: string }> {
  return ghi('/api/books', 'POST', { id, prompt });
}

/**
 * Xóa một tác phẩm. Không hoàn tác được, không có thùng rác.
 *
 * Server đòi thân yêu cầu chứa ĐÚNG tên cuốn, và hàm này truyền `book` vào cả hai chỗ —
 * đường dẫn lẫn thân. Nghe như thừa, nhưng nó chặn đúng kiểu tai nạn nguy hiểm nhất: giao
 * diện dựng URL từ một biến và thân từ một biến khác, rồi xóa nhầm cuốn đang mở. Ở đây hai
 * chỗ đến từ MỘT tham số nên chúng không thể lệch nhau.
 *
 * Việc xác nhận với người dùng là của bề mặt gọi hàm này, không phải của tầng API.
 */
export function xoaSach(book: string): Promise<{ book: string; deleted: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}`, 'DELETE', { xac_nhan: book });
}

/**
 * Danh sách model mà một nhà cung cấp thật sự phục vụ.
 *
 * Gọi hàm này CŨNG LÀ kiểm tra kết nối: nó dùng khóa đang lưu để hỏi thẳng nhà cung cấp,
 * nên gọi được nghĩa là địa chỉ gốc đúng và khóa còn sống. Lỗi trả về đã được server dịch
 * sang câu nói ra nguyên nhân ("khóa API sai hoặc hết hạn") thay vì một mã HTTP trần.
 */
/**
 * Kết quả lượt thử gọi công cụ — `tools` của câu trả lời liệt kê model, chỉ có khi xin.
 *
 * `checked: false` kèm `note` nghĩa là CHƯA thử (chưa chọn model, giao thức chưa hỗ trợ) —
 * khác với thử rồi mà hỏng (`checked: true, ok: false`, `reason` đã dịch sang tiếng Việt).
 */
export interface KetQuaCongCu {
  model?: string;
  checked: boolean;
  ok: boolean;
  reason?: string;
  note?: string;
  /** Câu gốc của nhà cung cấp, cho `title`. */
  raw?: string;
}

/**
 * `congCu: true` xin thêm MỘT lượt chat tí hon kèm công cụ để biết model có gọi công cụ được
 * không — chỉ nút Kiểm tra gửi cờ này. Bộ chọn model nạp danh sách thì không (khỏi tốn tiền).
 */
export function lietKeModel(
  provider?: string,
  tuyChon: { congCu?: boolean; model?: string } = {},
): Promise<{
  provider: string;
  models: string[];
  count: number;
  /**
   * Cửa sổ ngữ cảnh do CHÍNH nhà cung cấp khai, theo tên model.
   *
   * Đây là nguồn đúng duy nhất: cùng một tên model có trần khác nhau ở hai gateway
   * (`cx/gpt-5.6-luna` là 272.000 ở 9Router, còn registry toàn cục nói 1.050.000 vì nó
   * mô tả model GỐC của hãng). Vắng mặt khi nhà cung cấp không khai.
   */
  windows?: Record<string, number>;
  tools?: KetQuaCongCu;
}> {
  // Qua đường GHI dù là GET: server đặt `/api/models` sau hàng rào chống CSRF vì nó phát
  // một yêu cầu ra ngoài kèm khóa API. `doc()` không gắn header rào nên sẽ ăn 403.
  const ts = new URLSearchParams();
  if (provider) ts.set('provider', provider);
  if (tuyChon.congCu) ts.set('tools', '1');
  if (tuyChon.model) ts.set('model', tuyChon.model);
  const q = ts.toString() ? `?${ts.toString()}` : '';
  return ghiDoc(`/api/models${q}`);
}

/**
 * Kiểm một nhà cung cấp ĐANG GÕ, chưa lưu — POST /api/models/try. Trường vắng lấy từ mục đã
 * lưu cùng tên, nên khi sửa mà không gõ lại khóa vẫn kiểm được bằng khóa cũ. Không ghi gì.
 */
export function thuKetNoi(nhap: {
  name: string;
  type?: string;
  base_url?: string;
  api_key?: string;
  /** Model để thử gọi công cụ; vắng thì server thử `auto` nếu có. */
  model?: string;
  tools?: boolean;
}): Promise<{
  provider: string;
  models: string[];
  count: number;
  windows?: Record<string, number>;
  tools?: KetQuaCongCu;
}> {
  return ghi('/api/models/try', 'POST', nhap);
}

/**
 * Nạp lại cấu hình model từ đĩa vào engine ĐANG MỞ của một cuốn — nút "Áp dụng ngay".
 * Kiểu văn vẫn chỉ ăn từ lần mở phiên sau.
 */
export function apDungCauHinh(book: string): Promise<{ applied: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/models/apply`, 'POST');
}

export function doiCheDoTien(
  book: string,
  mode: 'auto' | 'review',
): Promise<{ mode: string; permit_chapter: number; has_hold: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/advance-mode`, 'PUT', { mode });
}

export function choDiTiep(
  book: string,
): Promise<{ permit_chapter: number; running: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/advance`, 'POST');
}

export function moLaiSach(
  book: string,
  direction: string,
): Promise<{ reopened: boolean; resumed: string }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/reopen`, 'POST', { direction });
}

/** Trạng thái sống của engine đang mở — `Snapshot()` của Host, tên trường kiểu Go. */
export function laySong(book: string): Promise<TrangThaiSong> {
  return doc<TrangThaiSong>(`/api/books/${encodeURIComponent(book)}/live`);
}

/* ── engine hỏi người dùng ─────────────────────────────────────────────── */

export function traLoiHoi(
  book: string,
  id: string,
  answers: Record<string, string>,
  notes?: Record<string, string>,
): Promise<{ answered: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/ask`, 'POST', { id, answers, notes });
}

/* ── cùng dựng ─────────────────────────────────────────────────────────── */

export function cungDungMoSach(history: LuotCungDung[]): Promise<DapCungDung> {
  return ghi('/api/cocreate', 'POST', { history });
}

export function cungDungGiaiDoan(
  book: string,
  history: LuotCungDung[],
): Promise<DapCungDung> {
  return ghi(`/api/books/${encodeURIComponent(book)}/stage-cocreate`, 'POST', { history });
}

export function chotCungDung(book: string, apply: string): Promise<{ applied: boolean }> {
  return ghi(`/api/books/${encodeURIComponent(book)}/stage-cocreate`, 'POST', {
    history: [],
    apply,
  });
}

/* ── luồng tệp ─────────────────────────────────────────────────────────── */

/**
 * Tải tệp lên và chạy một luồng.
 *
 * Không dùng `ghi()`: thân là `multipart/form-data`, và `ghi()` đặt cứng
 * `Content-Type: application/json`. Header rào vẫn phải có — nhưng KHÔNG được tự đặt
 * Content-Type cho multipart, vì `fetch` phải tự sinh `boundary`.
 */
async function taiLen<T>(duong: string, form: FormData): Promise<T> {
  const res = await fetch(`${GOC}${duong}`, {
    method: 'POST',
    headers: { 'X-Ainovel-Studio': '1' },
    body: form,
    cache: 'no-store',
  });
  if (!res.ok) {
    let td = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) td = b.error;
    } catch {
      /* thân không phải JSON */
    }
    throw new LoiApi(td, res.status);
  }
  return (await res.json()) as T;
}

export function nhapTruyen(
  book: string,
  tep: File,
  tuyChon: { autoConfirm?: boolean; story?: string; guide?: string; continueAfter?: boolean },
): Promise<KetQuaLuongTep> {
  const f = new FormData();
  f.append('file', tep);
  if (tuyChon.autoConfirm) f.append('auto_confirm', 'true');
  if (tuyChon.story) f.append('story', tuyChon.story);
  if (tuyChon.guide) f.append('guide', tuyChon.guide);
  if (tuyChon.continueAfter) f.append('continue', 'true');
  return taiLen<KetQuaLuongTep>(`/api/books/${encodeURIComponent(book)}/import`, f);
}

export function chayMoPhong(book: string, tep: File[]): Promise<KetQuaLuongTep> {
  const f = new FormData();
  for (const t of tep) f.append('file', t);
  return taiLen<KetQuaLuongTep>(`/api/books/${encodeURIComponent(book)}/simulate`, f);
}

export function nhapHoSoMoPhong(book: string, tep: File): Promise<KetQuaLuongTep> {
  const f = new FormData();
  f.append('file', tep);
  return taiLen<KetQuaLuongTep>(`/api/books/${encodeURIComponent(book)}/simulate/profile`, f);
}

/**
 * Xuất bản và TẢI VỀ.
 *
 * Không đi qua `ghi()` vì phản hồi là tệp nhị phân, không phải JSON. Tên tệp lấy từ
 * `Content-Disposition` của server — server biết tên đúng (có dấu tiếng Việt, đã mã hóa
 * RFC 5987), còn giao diện thì phải đoán.
 */
export async function xuatBan(
  book: string,
  tuyChon: { format?: 'TXT' | 'EPUB'; from?: number; to?: number } = {},
): Promise<{ ten: string; boQua: number[]; soChuong: number }> {
  const q = new URLSearchParams();
  if (tuyChon.format) q.set('format', tuyChon.format);
  if (tuyChon.from) q.set('from', String(tuyChon.from));
  if (tuyChon.to) q.set('to', String(tuyChon.to));

  const res = await fetch(
    `${GOC}/api/books/${encodeURIComponent(book)}/export?${q.toString()}`,
    { method: 'POST', headers: { 'X-Ainovel-Studio': '1' }, cache: 'no-store' },
  );
  if (!res.ok) {
    let td = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) td = b.error;
    } catch {
      /* không phải JSON */
    }
    throw new LoiApi(td, res.status);
  }

  const cd = res.headers.get('Content-Disposition') ?? '';
  const khop = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]+)"/.exec(cd);
  const ten = khop ? decodeURIComponent(khop[1]!) : `${book}.txt`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ten;
  a.click();
  URL.revokeObjectURL(url);

  const boQua = (res.headers.get('X-Ainovel-Skipped') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { ten, boQua, soChuong: Number(res.headers.get('X-Ainovel-Chapters') ?? 0) };
}
