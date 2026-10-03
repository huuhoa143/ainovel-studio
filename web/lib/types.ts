/**
 * Bản đối chiếu TypeScript của hợp đồng JSON trong internal/serve/model.go.
 *
 * Quy ước dịch: trường Go có `omitempty` và là con trỏ (`*int64`) thì ở đây là
 * `?: number` — vắng mặt, KHÔNG phải 0. Trường Go `omitempty` trên slice thì ở
 * đây là `?: T[]` vì server bỏ khóa khi mảng rỗng. Giao diện không được coi
 * `undefined` là 0 hay mảng rỗng ở nơi hai thứ đó khác nghĩa; chỗ nào khác
 * nghĩa đều có ghi chú tại đúng trường.
 *
 * Mã enum để nguyên tiếng Anh vì đó là dữ liệu. Chữ hiển thị nằm ở lib/nhan.ts.
 */

/** Dữ liệu nào thật sự có trong store của bản engine này. */
export interface Capabilities {
  /** false → không đo được thời lượng theo chương, ẩn cả cột. */
  per_chapter_duration: boolean;
  /** false → store chỉ cộng chi phí theo agent/model, KHÔNG theo chương. */
  per_chapter_cost: boolean;
  /** false → truyện phẳng, không có tập/cung. */
  layered_outline: boolean;
  /** false → engine chưa hợp tác nhận can thiệp qua web; ô nhập phải vô hiệu. */
  steer: boolean;

  /*
   * Ba cờ dưới đây phục vụ ba bề mặt Văn phong / Chi phí / Cài đặt.
   *
   * Chúng là `?:` chứ không phải `boolean` vì bản engine cũ hơn không có khóa
   * này trong JSON, và `undefined` ở đây KHÁC `false`: một cái nghĩa là bản
   * engine không biết câu hỏi, cái kia nghĩa là nó biết và trả lời không.
   *
   * Ba cờ này chỉ dùng để chọn CÂU cho trạng thái rỗng — phân biệt "store chưa
   * có tệp đó" với "tệp có mà rỗng". Chúng KHÔNG dùng để quyết định có vẽ bề mặt
   * hay không: dữ liệu thật thắng cờ, theo đúng bài học LayeredOutline ghi ở
   * internal/serve/model.go — hai đường suy luận song song về cùng một dữ liệu
   * sẽ có lúc lệch, và khi lệch thì ẩn một bề mặt còn đủ dữ liệu để vẽ là hướng
   * sai tệ hơn.
   */
  /** false → store chưa có meta/style_rules.json. */
  style_rules?: boolean;
  /** false → store chưa có meta/usage.json. */
  cost_breakdown?: boolean;
  /** false → store chưa có cấu hình phiên chạy. */
  run_settings?: boolean;
}

export type Activity = 'running' | 'idle' | 'complete';

/**
 * Trạng thái engine TỰ KHẲNG ĐỊNH — năm giá trị, không ba.
 *
 * Cố ý KHÔNG dùng làm kiểu của `Snapshot.runtime`: trên dây nó là một `string` Go
 * (`host.UISnapshot.RuntimeState`), và một bản engine mới hơn web thêm giá trị thứ sáu là
 * chuyện đến được. Khai `runtime: Runtime` sẽ làm `tsc` xanh trên một điều chưa ai bảo đảm,
 * rồi mã đọc phải một chuỗi ngoài tập này mà không có nhánh nào đỡ. Nên: dây là `string`,
 * còn tập đóng này chỉ dùng SAU khi đã qua `mayNaoDo` (lib/song.ts) — cùng cách `laKhu`
 * canh cửa cho `Khu`.
 *
 * Khác `Activity` ở hai chỗ mang tin: có `pausing`/`paused` (Activity gộp cả hai vào `idle`
 * hoặc tệ hơn là để chúng trôi thành `running`), và dùng `completed` thay vì `complete`.
 */
export type Runtime = 'idle' | 'running' | 'pausing' | 'paused' | 'completed';

export interface Book {
  id: string;
  /** Rỗng khi chưa đặt tên. */
  name: string;
  phase: string;
  flow?: string;
  completed_chapters: number;
  total_chapters: number;
  total_words: number;
  activity: Activity;
  updated_at?: string;

  /**
   * Năm trường cho bề mặt Xưởng.
   *
   * Chúng nằm ở `/workshop` chứ không phải `/studio` có lý do: bảng Xưởng liệt kê MỌI cuốn,
   * nên nếu phải lấy từ `/studio` thì một xưởng mười cuốn là mười lượt đọc store cho một lần
   * mở trang — và mười thời điểm khác nhau trong cùng một bảng.
   */
  cost_usd: number;
  cost_per_chapter: number;
  chapters_per_hour: number;
  engine_open: boolean;
  /** Lần dừng gần nhất của phiên đang mở — cùng phép chiếu với `Snapshot.stop`. */
  stop?: LanDung;
}

export interface Workshop {
  root: string;
  /** Server luôn trả mảng; rỗng = xưởng chưa có tác phẩm nào. */
  books: Book[];
  /**
   * Mã bản dựng giao diện mà server ĐANG phục vụ.
   *
   * Đổi nghĩa là tệp JS trên đĩa đã bị thay dưới chân tab này. Vắng mặt ở bản chỉ-API.
   */
  web_build?: string;
}

/**
 * done | running | planned | unplanned
 *  planned   = đã có cấu trúc chi tiết, chưa chạy tới
 *  unplanned = mới là bộ khung, Architect sẽ mở khi tới lượt
 */
export type BlockState = 'done' | 'running' | 'planned' | 'unplanned';

export interface LaneBlock {
  index: number;
  title?: string;
  state: BlockState;
  /**
   * Số chương thật khi đã mở, hoặc số dự kiến khi còn là bộ khung.
   * 0 nghĩa là CHƯA BIẾT — không phải "không có chương nào". Xem
   * lib/truc.ts:trongSoKhoi để biết chỗ này biến thành độ rộng ra sao.
   */
  chapters: number;
  /** true khi `chapters` là số dự kiến, không phải số đã mở. */
  estimated?: boolean;
  final?: boolean;
  /** Chương đầu/cuối, chỉ có khi khối đã mở. */
  from?: number;
  to?: number;
}

export type MarkState = 'done' | 'running' | 'rewrite' | 'gate' | 'pending';

/**
 * Trạng thái vạch như trên MÀN: thêm `vietDo` — `running` của store khi máy KHÔNG chạy (xem
 * `VIET_DO` ở lib/nhan.ts). Chỉ web tạo ra nó; server không bao giờ gửi.
 */
export type VachHien = MarkState | 'vietDo';

/** Vạch chương mang trạng thái MÀN — mọi hàm trục nhận được cả vạch thô lẫn vạch đã chuẩn hóa. */
export type VachChuong = Omit<ChapterMark, 'state'> & { state: VachHien };

export interface ChapterMark {
  chapter: number;
  state: MarkState;
}

/**
 * Trục sản xuất.
 *
 * # `volumes` và `arcs` CÓ THỂ null, và kiểu này từng nói dối về điều đó
 *
 * Với truyện không phân tầng (ngắn/vừa, không có tập/cung), server gửi
 * `{"volumes": null, "arcs": null}` — slice nil của Go thành `null` trong JSON, không
 * thành `[]`.
 *
 * Bản trước khai chúng là `LaneBlock[]` không cho null. Hệ quả KHÔNG phải một cảnh báo
 * kiểu: nó là ngược lại — `tsc` XANH vì nó tin lời khai, nên `blocks.find(...)` được viết
 * mà không ai chặn, và bề mặt Dòng sản xuất **làm sập renderer** với mọi truyện không phân
 * tầng. Bề mặt đó là chỗ người dùng đáp xuống ở URL gốc.
 *
 * Lỗi sống lâu vì mọi fixture và mọi cuốn đem ra thử đều PHÂN TẦNG. Nó lộ ra ở cuốn không
 * phân tầng đầu tiên — một cuốn 3 chương tạo từ web.
 *
 * Nên khai `| null` ở đây không phải để cho chặt hơn: nó là cái duy nhất bắt `tsc` từ chối
 * `blocks.find` mà không kiểm null. Bảo đảm lúc biên dịch, mạnh hơn một bài kiểm.
 */
export interface Timeline {
  volumes: LaneBlock[] | null;
  /** Các cung trong tập hiện tại, không phải mọi cung của tác phẩm. */
  arcs: LaneBlock[] | null;
  chapters: ChapterMark[];
}

export type Stage = 'done' | 'drafting' | 'rewrite' | 'pending';

export interface ChapterRow {
  chapter: number;
  title?: string;
  stage: Stage;
  words?: number;
  /**
   * Vắng = không đo được (chương chỉ có một checkpoint, hoặc chưa chạy).
   * KHÔNG hiển thị 0: 0 nghĩa là xong tức thời, đó là một lời nói dối cụ thể.
   */
  duration_ms?: number;
  /** Các vai đã tham gia chu kỳ gần nhất. */
  owner?: string[];
  /** Có bản nhận xét riêng (reviews/NN.json) — không phải chương nào cũng được nhận xét. */
  reviewed?: boolean;
}

export interface Dimension {
  name: string;
  score?: number;
  verdict?: string;
  comment?: string;
}

export interface Issue {
  type: string;
  severity: string;
  description: string;
  evidence?: string;
  suggestion?: string;
  chapters?: number[];
  needs_change: boolean;
}

export interface Review {
  chapter: number;
  scope: string;
  verdict: string;
  summary?: string;
  dimensions?: Dimension[];
  issues?: Issue[];
  contract_status?: string;
  contract_misses?: string[];
}

export interface Contract {
  chapter: number;
  title?: string;
  core_event?: string;
  hook?: string;
  scenes?: string[];
}

export interface Decision {
  id: string;
  at: string;
  kind: string;
  decider: string;
  reason?: string;
  input?: string;
  model?: string;
  /** Ở đây 0 = vắng (Go dùng omitempty trên int64, không phải con trỏ). */
  duration_ms?: number;
  error?: string;
  /** Quyết định thô, giữ nguyên để xem lại được. */
  decision?: unknown;
}

export interface Transport {
  state: Activity;
  /**
   * Công đoạn vừa HOÀN THÀNH, không phải công đoạn đang chạy. Store chỉ ghi
   * checkpoint khi một bước thành công. Công đoạn đang chạy chỉ có trong SSE.
   */
  last_step?: string;
  agent?: string;
  model?: string;
  cost_usd: number;
  /** Tổng chi phí / số chương đã xong — có nguồn thật, khác chi phí từng chương. */
  cost_per_chapter?: number;
  /** Vắng khi phiên quá ngắn để con số có nghĩa. */
  chapters_per_hour?: number;
  elapsed_ms?: number;
  /**
   * Lượt gọi LLM gần nhất (từ usage.json, có cả khi engine đã đóng). `provider` là TÊN nhà
   * cung cấp đã cấu hình (vd. "9Router"), không phải loại giao thức. Khác `model` ở trên —
   * `model` là model MẶC ĐỊNH lúc mở phiên, không phải model của vai nào. Vắng khi chưa có lượt.
   */
  last_call?: LuotGoi;
}

/** Một lượt gọi LLM đã ghi nhận — `transport.last_call`. */
export interface LuotGoi {
  /** Vai: architect | writer | editor | arbiter … */
  agent: string;
  provider: string;
  model: string;
  /** RFC 3339. */
  at: string;
}

export interface Selection {
  chapter: number;
  title?: string;
  contract?: Contract;
  review?: Review;
  excerpt?: string;
  words?: number;
}

/**
 * Một tác tử đang làm việc.
 *
 * `turn` là số lượt của tác tử trong chu kỳ hiện tại. TUI gốc hiện nó dạng `writer turn 7`,
 * và nó là dấu hiệu duy nhất phân biệt "đang chạy lâu" với "treo".
 */
export interface Vai {
  role: string;
  state: string;
  tool?: string;
  /** Chương mà lượt gọi công cụ đang chạy nói tới — `read_chapter(1)`, `edit_chapter(1)`… */
  chapter?: number;
  turn?: number;
  task?: string;
  depth: number;
}

/** Lần dừng gần nhất — `kind`: user (bạn dừng) | gate (chờ duyệt) | budget | stuck (tự dừng). */
export interface LanDung {
  at: string;
  kind: 'user' | 'gate' | 'budget' | 'stuck' | string;
  reason: string;
  last_error?: string;
  /** Vai gặp lỗi ấy — `writer`, `architect_long`… */
  last_error_agent?: string;
}

/** Chế độ đi tiếp và cửa nghiệm thu. */
export interface TienDo {
  mode: string;
  permit_chapter?: number;
  hold: boolean;
  hold_reason?: string;
}

/** Cửa sổ ngữ cảnh của model đang chạy. */
export interface NguCanh {
  tokens: number;
  window: number;
  percent: number;
  scope?: string;
  strategy?: string;
}

export interface Snapshot {
  book: Book;
  capabilities: Capabilities;
  timeline: Timeline;

  /**
   * Năm trường SỐNG: `null` nghĩa là engine đang ĐÓNG nên KHÔNG ĐO ĐƯỢC — khác hẳn `0` hay
   * `[]`, vốn nghĩa là "đo được, bằng không". Giao diện phải có hai nhánh vẽ khác nhau: một
   * thước ngữ cảnh 0% và một dấu "không có nguồn" nói hai điều khác nhau.
   *
   * `| null` ở đây là HÀNG RÀO BIÊN DỊCH, không phải chú thích. Một trường khai không-null
   * cho một payload trả `null` làm `tsc` xanh trong khi renderer sập — đã xảy ra một lần với
   * `Timeline.volumes`. Có bộ canh giữ luật này: TestKieuTruongSongPhaiChoNull (Go, quét
   * chính tệp này).
   */
  agents: Vai[] | null;
  idle_agents: string[] | null;
  advance: TienDo | null;
  context: NguCanh | null;
  in_progress_chapter: number | null;

  /**
   * Trạng thái engine tự khẳng định: `idle` | `running` | `pausing` | `paused` | `completed`.
   * `''` khi engine đóng.
   *
   * KHÔNG thay được bằng `book.activity`. `activity` suy từ mốc checkpoint trong store, nên nó
   * còn nói `running` vài phút sau khi engine đã dừng — xem `mayDangChay` trong lib/song.ts.
   * Trường này là thứ phân biệt "engine đang viết" với "engine đã dừng, chờ bạn cấp phép
   * chương sau", và cả màn Cửa nghiệm thu đứng trên phép phân biệt đó.
   */
  runtime: string;
  /**
   * Lần dừng gần nhất của phiên đang mở: ai dừng, vì sao, lỗi model cuối cùng trước lúc đó.
   * Vắng khi engine đóng, đang chạy, hoặc chưa dừng lần nào. Xem `lyDoTuDung` (lib/loiLlm.ts).
   */
  stop?: LanDung;
  pending_steer?: string;
  rewrite_reason?: string;
  recovery?: string;
  chapters: ChapterRow[];
  transport: Transport;
  decisions?: Decision[];
  selected?: Selection;
  /** Kiểm tra nhất quán nông của store. Hiện ra, không nuốt đi. */
  warnings?: string[];
  /** Điểm bắt đầu cho SSE (?after=) để không bỏ sót và không nhận trùng. */
  queue_seq: number;
}

/** Toàn văn một chương — GET /api/books/{book}/chapters/{n}. */
export interface ChapterDetail {
  chapter: number;
  title?: string;
  words: number;
  text: string;
  contract?: Contract;
  review?: Review;
}

/**
 * Bề mặt có tồn tại ở bản engine đang chạy hay không.
 *
 * Ba giá trị này là ba câu trả lời KHÁC NHAU cho rail, và trộn chúng lại là
 * đúng lỗi mà `MucChuaDung` tồn tại để tránh:
 *
 *   'thieu-endpoint' → bản engine này không có route đó (404). Rail phải vẽ mục
 *                      dưới dạng "chưa dựng": bấm vào sẽ không có gì.
 *   'co-nguon'       → route có và trả về dữ liệu. Rail vẽ nút thật.
 *   'co-route'       → route có nhưng chưa đọc được / chưa có dữ liệu. Rail vẫn
 *                      vẽ nút thật, vì bề mặt đã dựng và nó có câu để nói về
 *                      chuyện store rỗng. Ẩn nút ở đây sẽ biến "tác phẩm mới"
 *                      thành "studio thiếu bề mặt" — hai kết luận khác nhau.
 */
export type TinhTrangNguon = 'thieu-endpoint' | 'co-route' | 'co-nguon';

/** Đếm hồ sơ tác phẩm cho rail. null = endpoint trả null, tức store chưa có. */
export interface Profile {
  characters: number | null;
  rules: number | null;
  foreshadow: number | null;
  /**
   * Ba bề mặt mới chỉ có ở bản engine đã dựng endpoint cho chúng. Rail hỏi thăm
   * một lượt khi đổi tác phẩm — cùng nhịp với ba số đếm trên, không nằm trong
   * vòng làm mới 1,5s.
   */
  vanPhong: TinhTrangNguon;
  chiPhi: TinhTrangNguon;
  caiDat: TinhTrangNguon;
}

/* ── hồ sơ tác phẩm: dàn ý / nhân vật / luật thế giới ───────────────────── */

/**
 * Ba endpoint hồ sơ (`/outline`, `/cast`, `/world`) trả `null` cho từng mảng
 * khi tệp tương ứng không tồn tại (store.ReadJSON + os.IsNotExist → nil, nil).
 *
 * `null` KHÁC `[]` ở đây và cả hai đều phải hiện khác nhau:
 *   null = chưa dựng nền tác phẩm, engine chưa ghi tệp đó lần nào
 *   []   = đã dựng nền mà mục này rỗng — một sự thật khác hẳn
 * Gộp hai ca lại thành "chưa có gì" là nói dối một trong hai.
 */

/** Một chương trong dàn ý — cũng là khế ước chương khi đã mở. */
export interface OutlineEntry {
  chapter: number;
  title: string;
  core_event: string;
  hook: string;
  /** null khi Architect chưa chia cảnh cho chương này. */
  scenes: string[] | null;
}

/** Cung trong một tập. `chapters === null` = còn là bộ khung, chưa mở. */
export interface ArcOutline {
  index: number;
  title: string;
  goal: string;
  /** Số chương dự kiến của cung còn là bộ khung; mở rồi thì server bỏ khóa. */
  estimated_chapters?: number;
  chapters: OutlineEntry[] | null;
}

/** Tập. `arcs === null` = tập mới là bộ khung, Architect chưa mở cung nào. */
export interface VolumeOutline {
  index: number;
  title: string;
  /** Xung đột/chủ đề cốt lõi của tập. */
  theme: string;
  /** true = tập chốt: cả bộ thu về trong tập này. */
  final?: boolean;
  arcs: ArcOutline[] | null;
}

/** GET /api/books/{book}/outline */
export interface OutlineDoc {
  /** Tiền đề, dạng markdown thô. Rỗng khi chưa có premise.md. */
  premise: string;
  volumes: VolumeOutline[] | null;
  /** Dàn ý phẳng — với truyện phân tầng thì đây là bản dàn trải của volumes. */
  flat: OutlineEntry[] | null;
}

export interface Character {
  name: string;
  aliases?: string[];
  role: string;
  description: string;
  arc: string;
  traits: string[] | null;
  /** core / important / secondary / decorative. Vắng = important. */
  tier?: string;
}

/** Trạng thái một nhân vật ở cuối cung gần nhất. */
export interface CharacterSnapshot {
  volume: number;
  arc: number;
  name: string;
  status: string;
  power?: string;
  motivation: string;
  relations?: string;
}

/** GET /api/books/{book}/cast */
export interface CastDoc {
  characters: Character[] | null;
  snapshots: CharacterSnapshot[] | null;
}

export interface WorldRule {
  /** magic / technology / geography / society / other */
  category: string;
  rule: string;
  /** Ranh giới không được vi phạm. */
  boundary: string;
}

export interface ForeshadowEntry {
  id: string;
  description: string;
  planted_at: number;
  /** planted / advanced / resolved */
  status: string;
  /** Chỉ có khi status = resolved. */
  resolved_at?: number;
}

export interface RelationshipEntry {
  character_a: string;
  character_b: string;
  relation: string;
  chapter: number;
}

/** GET /api/books/{book}/world */
export interface WorldDoc {
  rules: WorldRule[] | null;
  foreshadow: ForeshadowEntry[] | null;
  relations: RelationshipEntry[] | null;
}

/* ── văn phong: quy tắc viết Editor chưng ra ở ranh giới cung ───────────── */

/** Quy tắc giọng của một nhân vật. */
export interface CharacterVoice {
  name: string;
  /** null khi tệp có mục nhân vật đó mà chưa có quy tắc nào. */
  rules: string[] | null;
}

/**
 * Quy tắc Editor chưng ra từ chương đã viết — `meta/style_rules.json`.
 *
 * `volume`/`arc` là CỬA SỔ của cả khối, không phải nhãn trang trí: Editor chưng
 * quy tắc ở ranh giới cung, nên bộ quy tắc này mô tả cung VỪA ĐÓNG. Dây chuyền
 * đã đi sang cung sau thì nó vẫn là bộ quy tắc mới nhất, nhưng không phải bộ
 * quy tắc của chương đang viết — và người vận hành phải đọc được điều đó.
 *
 * `volume`/`arc` KHÔNG optional: `0` nghĩa là "chưa gắn được tập/cung" và đó là
 * tin thật, không phải khóa vắng (internal/serve/model.go:272).
 */
export interface ArcStyle {
  volume: number;
  arc: number;
  /** 3–5 quy tắc lối kể. null = chưa có tệp / chưa chưng lần nào. */
  prose: string[] | null;
  dialogue: CharacterVoice[] | null;
  /** Danh sách cấm. */
  taboos: string[] | null;
  updated_at: string;
}

/**
 * Quy tắc người dùng KHAI, đã chuẩn hóa — `meta/user_rules.json`.
 *
 * Ngược chiều nhân quả với `ArcStyle`: đây là CHỈ THỊ ("hãy viết thế này"), còn
 * `ArcStyle` là MÔ TẢ ("văn hóa ra đang thế này"). Xem ghi chú ở `StyleDoc`.
 */
export interface UserStyle {
  /**
   * ready | degraded — `degraded` nghĩa là ít nhất một nguồn chuẩn hóa thất bại
   * và đã bị hạ thành `preferences` thô. Phải hiện ra: phần luật máy-kiểm-được
   * của nguồn đó KHÔNG còn được máy cưỡng chế nữa, chỉ mô hình đọc.
   */
  status: string;
  genre: string;
  forbidden_phrases: string[] | null;
  forbidden_chars: string[] | null;
  /** "từ → tối đa mấy lần MỖI CHƯƠNG". Hạn mức, KHÔNG phải danh sách cấm. */
  fatigue_words: Record<string, number> | null;
  preferences: string;
  /** Nhãn nguồn đã góp vào bản chuẩn hóa: `system_defaults`, `global:<tệp>`… */
  declared_by: string[] | null;
  uncertain: string[] | null;
}

/**
 * GET /api/books/{book}/style — `internal/serve/model.go:259`.
 *
 * HAI NGUỒN độc lập, và tách chúng ra là điểm chính của hợp đồng này. Chênh lệch
 * thời điểm mới là lý do: `style_rules.json` chỉ tồn tại SAU biên cung đầu tiên,
 * còn `user_rules.json` đã có ngay từ lúc mở sách. Một bề mặt chỉ đọc tệp thứ
 * nhất sẽ rỗng trơn suốt cả cung đầu của mọi tác phẩm — rỗng đúng lúc người vận
 * hành cần nó nhất, khi họ vừa dặn xong và muốn biết engine có nghe không.
 */
export interface StyleDoc {
  /** null = chưa có meta/style_rules.json (chưa qua biên cung nào). */
  arc_style: ArcStyle | null;
  /** null = chưa có meta/user_rules.json (chưa mở sách qua Host). */
  user_rules: UserStyle | null;
  /**
   * Nguồn nào đọc được mà HỎNG. Một tệp hỏng không làm trắng cả bề mặt khi nguồn
   * còn lại vẫn đọc được — nhưng cũng không được nuốt: "rỗng vì chưa có" và "rỗng
   * vì hỏng" là hai tin vận hành khác nhau.
   *
   * Nên ca "đọc được mà hỏng" tới ở HTTP 200, KHÔNG qua nhánh lỗi fetch. Chỉ bắt
   * lỗi fetch thì nó biến mất không dấu vết.
   */
  warnings: string[] | null;
}

/* ── chi phí: cộng dồn theo tác tử và theo model ────────────────────────── */

/**
 * Một ô cộng dồn — `domain.AgentUsageTotals`.
 *
 * Mọi trường số ở đây là `number`, KHÔNG `?: number`, và đó là điều kiện để bề
 * mặt Chi phí nói thật: `$0` (đã gọi model mà chưa tốn tiền, hoặc model miễn
 * phí) và "chưa có số liệu" là hai chuyện khác nhau. Nếu server đặt `omitempty`
 * lên các trường này thì khóa `0` bị rụng khỏi JSON và hai ca đó gộp lại —
 * đúng lớp lỗi đã ghi ở `Dimension.Score` trong internal/serve/model.go.
 *
 * Vì thế giao diện kiểm bằng `!= null`, không bằng falsy.
 */
export interface UsageTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
  saved_usd: number;
  /** false → model không hỗ trợ đệm, nên hai cột đệm là "không áp dụng", không phải 0. */
  cache_capable: boolean;
  /**
   * Số lần chuỗi đệm bị đứt. Chỉ đếm ở đường chạy trực tiếp, không phát lại — nên
   * nó cũng là một con số SÀN.
   *
   * KHÔNG optional: server khai `int` không omitempty, nên `0` ("đã đo, không đứt
   * lần nào") luôn có mặt và phân biệt được với vắng.
   */
  cache_breaks: number;
}

/**
 * Bốn trạng thái nguồn chi phí — `internal/serve/model.go:315`.
 *
 * `stale_schema` là trạng thái thứ tư và nó tồn tại vì `UsageStore.Load()` trả
 * `(nil, nil)` cho HAI ca khác nhau: thiếu tệp, và tệp có mà `Schema` không khớp
 * bản engine đang chạy (internal/store/usage.go:25). Gộp lại thì một tác phẩm CÓ
 * số liệu cũ bị báo là "chưa chạy gì" — sai theo đúng hướng nguy hiểm nhất, vì nó
 * làm người vận hành tưởng mình chưa tốn tiền.
 */
export type TinhTrangChiPhi = 'ready' | 'no_file' | 'empty' | 'stale_schema';

/** GET /api/books/{book}/cost — `internal/serve/model.go:339`. */
export interface CostDoc {
  state: TinhTrangChiPhi;
  /** Rỗng khi chưa có số liệu; server không omitempty nên khóa luôn có mặt. */
  updated_at: string;
  /**
   * MẪU SỐ, không phải tiêu đề.
   *
   * `cost_usd` ở đây trùng `transport.cost_usd` LÀ CỐ Ý, và nó chỉ được dùng để
   * chia — "Writer chiếm 62% chi phí". In lại nó thành một con số lớn ở đầu bề mặt
   * là hero-metric, thứ PRODUCT.md:43 cấm, và là cách hai bản của một con số bắt
   * đầu lệch nhau. Việc in tổng là của thanh dưới.
   *
   * Vẫn phải có ở đây vì tổng TOKEN và `saved_usd` không tồn tại ở bất cứ đâu
   * khác trong API.
   */
  overall: UsageTotals;
  /** null = chưa có tệp. `{}` = có tệp mà chưa vai nào được cộng. */
  per_agent: Record<string, UsageTotals> | null;
  per_model: Record<string, UsageTotals> | null;
  /**
   * Số lượt gọi model KHÔNG báo lại usage. Lớn hơn 0 nghĩa là mọi con số trên
   * bề mặt này là SÀN, không phải số đúng — và đó là tin vận hành, không phải
   * chi tiết nội bộ.
   */
  missing_assistant_usage: number;
}

/* ── cài đặt phiên chạy ─────────────────────────────────────────────────── */

/** Ý định tạm dừng một lần, do can thiệp ký. */
export interface AdvanceHold {
  /** boundary | rewrites_drained */
  after: string;
  reason: string;
}

/** Phán quyết khởi động đã落盘 (server lược `raw_prompt` vì nó lặp `start_prompt`). */
export interface PlanStart {
  planner: string;
  planner_task: string;
  decision_id: string;
}

/**
 * GET /api/books/{book}/settings — `internal/serve/model.go:412`.
 *
 * Khóa API và cấu hình provider CỐ Ý không có ở đây, và sẽ không bao giờ có:
 * chúng không nằm trong store. Đưa khóa vào một payload HTTP là biến một rò rỉ
 * tiềm năng thành một rò rỉ có sẵn.
 */
export interface SettingsDoc {
  /**
   * ready | no_file. Cần vì đây là OBJECT, không có `null` của mảng để dựa vào —
   * "chưa có meta/run.json" và "có tệp mà mọi trường rỗng" sẽ đọc ra y hệt nhau
   * nếu không có trường này.
   */
  state: 'ready' | 'no_file';
  /**
   * Luôn `false` ở bản chỉ-đọc. ĐỌC TỪ ĐÂY, đừng hard-code phía web: ngày engine
   * nhận lệnh ghi, server đổi một chỗ và giao diện mở ô nhập theo.
   */
  writable: boolean;
  started_at: string;
  provider: string;
  model: string;
  /** Kiểu văn chọn lúc khởi động — KHÁC quy tắc văn phong Editor chưng ra sau. */
  style: string;
  /** short / mid / long */
  planning_tier: string;
  /** auto / review */
  advance_mode: string;
  /**
   * Chương được cấp phép đi tiếp ở chế độ `review`.
   *
   * `0` là giá trị THẬT ("chưa cấp phép chương nào") và ở chế độ review đó là câu
   * trả lời cho "vì sao dây chuyền đứng yên" — tức ca ĐÁNG HIỆN NHẤT. Kiểm
   * `!= null`, không kiểm falsy: kiểm falsy thì đúng ca đó biến mất.
   */
  advance_permit_chapter: number;
  /** null = không có ý định tạm dừng nào đang treo. */
  advance_hold: AdvanceHold | null;
  /** Chỉ thị can thiệp engine CHƯA xử lý. Rỗng là ca thường. */
  pending_steer: string;
  start_prompt: string;
  /** null = chưa có phán quyết khởi động nào落盘. */
  plan_start: PlanStart | null;
}

/** Một sự kiện SSE — khung ở internal/serve/events.go:sseEvent. */
export interface StreamEvent {
  seq: number;
  time: string;
  kind: string;
  category?: string;
  agent?: string;
  summary?: string;
  payload?: unknown;
}

/** Lỗi có thân JSON {"error": "..."} do writeErr sinh ra. */
export interface ApiError {
  error: string;
}

/* ── cấu hình ứng dụng (mức MÁY, không phải mức tác phẩm) ───────────────── */

/**
 * Một nhà cung cấp trong cấu hình.
 *
 * KHÔNG có trường khóa thật, và đó là khế ước chứ không phải sơ suất: server chỉ
 * trả `api_key_set` + `api_key_masked` (xem `cheKhoa` trong internal/serve/rao.go).
 * Nên biểu mẫu không bao giờ có khóa để gửi lại, và PUT phải hiểu "vắng khóa" là
 * "giữ khóa cũ".
 */
export interface NhaCungCap {
  name: string;
  type?: string;
  base_url?: string;
  api_key_set: boolean;
  api_key_masked?: string;
  /** Gateway chạy được không cần khóa (ollama/bedrock, hoặc địa chỉ trên máy/LAN). */
  api_key_optional?: boolean;
  /**
   * Một mục model mang NHIỀU HƠN cái tên, và mọi chỗ ghi lại nó phải giữ đủ.
   *
   * `context_window` là ưu tiên số một của phép phân giải cửa sổ ngữ cảnh; `json_schema` là
   * khai báo ba trạng thái quyết định request có kèm `response_format` hay không. Dựng lại
   * mục từ mỗi cái tên — điều biểu mẫu từng làm — là xóa sạch cả hai, vì server thay NGUYÊN
   * mảng (`caidat_ghi.go`: `if n.Models != nil`).
   */
  models?: MucModel[];
}

export interface MucModel {
  name: string;
  context_window?: number;
  json_schema?: boolean;
}

/**
 * Một mục `roles`. Mang đủ `fallbacks` + `reasoning_effort`: `PUT /api/config` thay CẢ map,
 * nên mọi lượt ghi phải gửi lại nguyên vẹn những gì nó không đổi.
 * `provider`/`model` rỗng = mục chỉ ghi đè độ suy luận, vai vẫn theo model mặc định.
 */
export interface MucVai {
  provider: string;
  model: string;
  fallbacks?: { provider: string; model: string }[];
  reasoning_effort?: string;
}

export interface MauNhaCungCap {
  name: string;
  label: string;
  type?: string;
  base_url?: string;
}

/** GET /api/config — cấu hình đang CÓ HIỆU LỰC (đã trộn global + project). */
export interface CauHinhDoc {
  needs_setup: boolean;
  /** Tệp mà mọi lượt ghi sẽ vào. Hiện ra để người dùng biết mình đang sửa cái gì. */
  path: string;
  provider: string;
  model: string;
  reasoning_effort?: string;
  style: string;
  /**
   * Danh sách kiểu văn CÓ TÁC DỤNG THẬT.
   *
   * `style` hiện tại có thể KHÔNG nằm trong danh sách này — engine bỏ qua giá trị lạ
   * một cách âm thầm (không lỗi, không cảnh báo). Bề mặt phải nói ra điều đó thay vì
   * hiện một ô chọn im lặng bỏ giá trị đang có.
   */
  styles: string[];
  role_names: string[];
  /**
   * Tệp cấu hình TOÀN CỤC đang được trộn dưới `path`, "" khi chỉ có một tệp. Giá trị chỉ có
   * ở tệp này không xóa được từ studio — server từ chối với 409 thay vì báo "đã lưu" suông.
   */
  base_path?: string;
  /** Ghi đè model theo vai đang có hiệu lực. `PUT /api/config` ghi được nó từ bản ba màn. */
  roles?: Record<string, MucVai> | null;
  providers: NhaCungCap[];
  presets: MauNhaCungCap[];
  /** Cuốn đang mở engine — đổi cấu hình KHÔNG ăn vào chúng cho tới lần mở lại. */
  engine_open: string[];
  /**
   * Cuốn đang mở mà phần model của phiên LỆCH tệp — chỉ những cuốn này cần "áp dụng ngay".
   * Vắng (engine cũ hơn web) thì coi mọi cuốn đang mở là có thể lệch, như trước.
   */
  engine_stale?: string[];
}

/** Một kênh model theo vai — GET /api/books/{b}/models. */
export interface KenhVaiMuc {
  role: string;
  provider: string;
  model: string;
  /** false = đang thừa hưởng mặc định, chưa đặt riêng cho vai này. */
  explicit: boolean;
  thinking: string;
  thinking_options: string[];
}

export interface VaiModelDoc {
  channels: KenhVaiMuc[];
  providers: string[];
  models_by_provider: Record<string, string[] | null>;
}

/* ── engine hỏi người dùng (luồng CHẶN) ─────────────────────────────────── */

export interface HoiMotCau {
  question: string;
  header: string;
  multi_select: boolean;
  options: { label: string; description: string }[];
}

/** Lượt hỏi đang chặn engine. Đi kèm /live, không có endpoint riêng. */
export interface HoiDangCho {
  /** Phải gửi lại khi trả lời: một tab cũ trả lời cho lượt khác sẽ bị từ chối. */
  id: string;
  questions: HoiMotCau[];
}

/**
 * Trạng thái sống của engine.
 *
 * `open: false` là câu trả lời HỢP LỆ (engine chưa mở), không phải lỗi — server trả 200
 * cho ca đó. Nên mọi trường còn lại là tùy chọn: chúng chỉ có nghĩa khi engine đang mở.
 */
export interface TrangThaiSong {
  open: boolean;
  stopped?: boolean;
  last_error?: string;
  asking?: HoiDangCho;
  snapshot?: Record<string, unknown>;
}

/* ── cùng dựng ──────────────────────────────────────────────────────────── */

export interface LuotCungDung {
  role: 'user' | 'assistant';
  text: string;
}

export interface DapCungDung {
  message: string;
  /** Bản đầy đủ để ghi vào lịch sử. Rỗng → dùng `message`. */
  raw?: string;
  /** RỖNG = giữ bản nháp cũ, KHÔNG phải xóa. Xem chú thích dapCungDung phía Go. */
  draft?: string;
  ready: boolean;
  suggestions?: string[];
}

/* ── luồng tệp ──────────────────────────────────────────────────────────── */

export interface DongNhatKy {
  stage: string;
  text: string;
  current?: number;
  total?: number;
  level?: string;
  error?: boolean;
}

export interface KetQuaLuongTep {
  log: DongNhatKy[];
  failed: boolean;
}

/* ── tổng cả xưởng — GET /api/workshop/cost ─────────────────────────────── */

/**
 * Phần của một cuốn trong tờ tổng.
 *
 * Cố ý KHÔNG lặp lại các trường mà `Book` đã mang (tiến độ, số từ, nhịp, engine mở): hai
 * bản sao của một con số thì có ngày lệch, và giao diện đã có cả hai tờ trong tay. Ghép
 * theo `id`, không theo chỉ số — hai tờ hôm nay cùng thứ tự (cả hai đi qua `scanWorkshop`,
 * và có bài kiểm Go canh điều đó) nhưng ghép theo vị trí là buộc một bất biến của server
 * vào một vòng lặp ở web.
 */
export interface TongXuongSach {
  id: string;
  /** ready | empty | no_file | stale_schema — bốn ca của bề mặt Chi phí. */
  cost_state: string;
  cost_usd: number;
  saved_usd: number;
  /**
   * Ý ĐỊNH ĐÃ KÝ trong `meta/run.json`, KHÔNG phải "engine đang đứng ở cửa".
   *
   * Rỗng = chưa có `meta/run.json`, tức cuốn chưa chạy engine lần nào. Khác hẳn `'auto'`,
   * vốn là một chế độ đã chọn. Câu "engine đang đứng chờ bạn" chỉ tồn tại trong
   * `/studio` của cuốn ĐANG MỞ engine — và vì engine chỉ mở được một cuốn mỗi lần, nhiều
   * nhất một cuốn trong cả xưởng nói được câu đó.
   */
  advance_mode: string;
  advance_hold: boolean;
  advance_hold_reason?: string;
  pending_steer: boolean;
}

export interface TongXuongDoc {
  books: TongXuongSach[];
  overall: UsageTotals;
  /** null không xảy ra ở route này (server luôn dựng map), nhưng để rỗng vẫn phải vẽ được. */
  per_agent: Record<string, UsageTotals>;
  per_model: Record<string, UsageTotals>;
  /** Số cuốn ĐÃ cộng vào `overall`. Đây là MẪU SỐ của con số tiền, và nó phải hiện ra. */
  counted: number;
  /** Id các cuốn không có số liệu để cộng. */
  no_data: string[];
  missing_assistant_usage: number;
}
