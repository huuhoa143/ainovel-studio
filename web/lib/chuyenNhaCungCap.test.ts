import { expect, test } from 'vitest';

import {
  coVaiLacCho,
  duKienChuyen,
  hieuLucCua,
  khaiThemNeuThieu,
  thanChiDoiMacDinh,
  thanChuyenCaDay,
  thanXoaNhaCungCap,
  vaiGuiLai,
} from './chuyenNhaCungCap';
import type { CauHinhDoc } from './types';

/**
 * Chuyển cả dây chuyền sang một nhà cung cấp khác.
 *
 * # Ca thật, đo được trên máy người dùng
 *
 * Họ dùng `9Router · cx/gpt-5.5`, hết quota, mua `gateway.dichvuright.ai` và đặt nó làm mặc
 * định dưới cái tên `openai`. Ba vai vẫn ghim `openai · cx/gpt-5.5` — nhà cung cấp thì đúng
 * tên, model thì của gateway CŨ. Arbiter chạy được (nó theo mặc định), Writer chết ở lượt đầu
 * với một thông báo nói về KHÓA API chứ không nói về tên model.
 *
 * Nguyên nhân là hai ô độc lập cho một cặp không tách rời được. Mô-đun này là luật của lượt
 * chuyển, và nó phải giữ đúng một điều: sang nhà cung cấp mới thì CẢ CẶP đi cùng nhau.
 */

const DU: CauHinhDoc = {
  needs_setup: false,
  path: '/x/config.json',
  provider: '9Router',
  model: 'cx/gpt-5.5',
  style: 'default',
  styles: ['default'],
  role_names: ['default', 'architect', 'writer', 'editor'],
  roles: {
    architect: { provider: '9Router', model: 'cx/gpt-5.5' },
    writer: { provider: '9Router', model: 'cx/gpt-5.5' },
    editor: { provider: '9Router', model: 'cx/gpt-5.4-mini' },
  },
  providers: [
    { name: '9Router', api_key_set: true, models: [{ name: 'cx/gpt-5.5' }, { name: 'cx/gpt-5.4-mini' }] },
    // Nhà cung cấp mới khai HAI model, và một trong hai TRÙNG tên với model cũ của editor.
    // Dữ liệu mẫu phải có cả hai ca, nếu không bài kiểm không phân biệt được "giữ tên khi
    // trùng" với "ép tất cả về model đầu tiên".
    { name: 'moi', api_key_set: true, models: [{ name: 'claude-opus-5' }, { name: 'cx/gpt-5.4-mini' }] },
  ],
  presets: [],
  engine_open: [],
};

test('hieuLucCua: vai thừa hưởng lấy CẶP của mặc định, vai ghim lấy cặp của nó', () => {
  const chuaGhim: CauHinhDoc = { ...DU, roles: { writer: DU.roles!.writer! } };
  expect(hieuLucCua(chuaGhim, 'architect')).toEqual({ provider: '9Router', model: 'cx/gpt-5.5' });
  expect(hieuLucCua(chuaGhim, 'writer')).toEqual({ provider: '9Router', model: 'cx/gpt-5.5' });
  expect(hieuLucCua(chuaGhim, 'default')).toEqual({ provider: '9Router', model: 'cx/gpt-5.5' });
});

test('đề xuất: TÊN TRÙNG thì giữ, không trùng thì rơi về model mặc định của nơi đến', () => {
  const dong = duKienChuyen(DU, 'moi', 'claude-opus-5');
  const cua = (v: string) => dong.find((d) => d.vai === v)!;

  // `cx/gpt-5.5` không có ở `moi` → phải đổi.
  expect(cua('writer').denModel).toBe('claude-opus-5');
  expect(cua('writer').giuDuocTen).toBe(false);

  // `cx/gpt-5.4-mini` CÓ ở `moi` → giữ nguyên. Ép nó về `claude-opus-5` là xóa mất sắp xếp
  // lớn/nhỏ mà người dùng cố ý dựng (Chấp bút model lớn, Biên tập model mini).
  expect(cua('editor').denModel).toBe('cx/gpt-5.4-mini');
  expect(cua('editor').giuDuocTen).toBe(true);
});

test('bảng nói rõ vai nào đang ĐẶT RIÊNG — mặc định không bao giờ là "ghim"', () => {
  const dong = duKienChuyen(DU, 'moi', 'claude-opus-5');
  expect(dong.find((d) => d.vai === 'default')!.dangGhim).toBe(false);
  expect(dong.filter((d) => d.dangGhim).map((d) => d.vai).sort()).toEqual([
    'architect',
    'editor',
    'writer',
  ]);
});

test('thân ghi mang CẢ CẶP cho mọi vai, và `default` KHÔNG lọt vào map roles', () => {
  const than = thanChuyenCaDay(duKienChuyen(DU, 'moi', 'claude-opus-5'), 'moi');

  expect(than.provider).toBe('moi');
  expect(than.model).toBe('claude-opus-5');
  // `default` là `cfg.Provider` + `cfg.ModelName`, một TRƯỜNG KHÁC. Nhét nó vào map sẽ tạo
  // một vai tên `default` mà tầng Go không biết — `NewModelSet` lỗi vì "unknown role".
  expect(Object.keys(than.roles).sort()).toEqual(['architect', 'editor', 'writer']);
  // Không vai nào còn trỏ về nhà cung cấp cũ — đó là toàn bộ điểm của lượt chuyển.
  expect(Object.values(than.roles).every((r) => r.provider === 'moi')).toBe(true);
  expect(than.roles.editor!.model).toBe('cx/gpt-5.4-mini');
  expect(than.roles.writer!.model).toBe('claude-opus-5');
});

test('sửa tay một ô trong bảng thì thân ghi mang giá trị ĐÃ SỬA', () => {
  const dong = duKienChuyen(DU, 'moi', 'claude-opus-5').map((d) =>
    d.vai === 'writer' ? { ...d, denModel: 'tu-go-tay' } : d,
  );
  expect(thanChuyenCaDay(dong, 'moi').roles.writer!.model).toBe('tu-go-tay');
});

/* ── khi nào mới cần hỏi ────────────────────────────────────────────────── */

test('còn vai đặt riêng ở nơi khác thì đổi mặc định là một CÂU HỎI', () => {
  expect(coVaiLacCho(DU, 'moi')).toBe(true);
});

test('mọi vai đã ở đúng nơi đến thì không hỏi — một hộp thừa là một bước thừa', () => {
  expect(coVaiLacCho(DU, '9Router')).toBe(false);
});

test('không vai nào đặt riêng thì cũng không hỏi', () => {
  expect(coVaiLacCho({ ...DU, roles: undefined }, 'moi')).toBe(false);
  expect(coVaiLacCho({ ...DU, roles: {} }, 'moi')).toBe(false);
});

/* ── không đẻ ra ghim mới ───────────────────────────────────────────────── */

/**
 * Vai đang THỪA HƯỞNG mà sau lượt chuyển vẫn dùng đúng cặp của mặc định thì phải tiếp tục
 * thừa hưởng.
 *
 * Ghi nó vào `cfg.Roles` là biến nó thành ĐẶT RIÊNG, và từ đó nó thôi đi theo mọi lần đổi mặc
 * định về sau — người dùng mất đúng thứ họ vừa dựng, mà không bấm gì để yêu cầu điều đó. Hỏng
 * này im lặng hoàn toàn: cấu hình vẫn chạy đúng NGAY LÚC ĐÓ, chỉ sai ở lần đổi mặc định kế.
 */
const KHONG_GHIM: CauHinhDoc = { ...DU, roles: undefined };

test('vai thừa hưởng vẫn thừa hưởng sau lượt chuyển — không sinh mục roles nào', () => {
  const than = thanChuyenCaDay(duKienChuyen(KHONG_GHIM, 'moi', 'claude-opus-5'), 'moi');
  expect(than.provider).toBe('moi');
  expect(than.model).toBe('claude-opus-5');
  expect(
    Object.keys(than.roles),
    'biến vai thừa hưởng thành đặt riêng — chúng thôi đi theo mặc định từ lần sau',
  ).toEqual([]);
});

test('nhưng vai thừa hưởng ĐƯỢC CHỌN model khác thì buộc phải thành mục riêng', () => {
  const dong = duKienChuyen(KHONG_GHIM, 'moi', 'claude-opus-5').map((d) =>
    d.vai === 'editor' ? { ...d, denModel: 'cx/gpt-5.4-mini' } : d,
  );
  const than = thanChuyenCaDay(dong, 'moi');
  expect(Object.keys(than.roles)).toEqual(['editor']);
  expect(than.roles.editor!.model).toBe('cx/gpt-5.4-mini');
});

test('vai ĐÃ ghim từ trước thì giữ nguyên là mục riêng, kể cả khi trùng model mặc định', () => {
  const than = thanChuyenCaDay(duKienChuyen(DU, 'moi', 'claude-opus-5'), 'moi');
  // `writer` được đề xuất `claude-opus-5` — trùng mặc định — nhưng nó ĐANG ghim, nên xoá mục
  // của nó là lặng lẽ đổi ý định của người dùng theo chiều ngược lại.
  expect(Object.keys(than.roles).sort()).toEqual(['architect', 'editor', 'writer']);
});

/* ── ghi cả map nghĩa là GIỮ cả map ─────────────────────────────────────── */

/**
 * Vai có trong `cfg.Roles` mà KHÔNG có trong `role_names` phải sống sót lượt ghi.
 *
 * `PUT /api/config` thay cả map `roles`, còn `dong` chỉ dựng từ `du.role_names` — bốn vai
 * server khai là đổi được. Bắt đầu từ map rỗng nên mọi khóa ngoài bốn cái đó bị xoá lặng lẽ.
 *
 * `MotKenhChung` bên cạnh đi từ `Object.entries(du.roles)` đúng vì lý do này. Hai đường ghi
 * trên cùng một bề mặt mà hiểu "ghi cả map" khác nhau là một quả mìn hẹn giờ: nó chưa nổ hôm
 * nay chỉ vì `vaiCoTheDoi` phía Go cũng đúng bốn vai ấy, và nó sẽ nổ vào ngày danh sách kia
 * dài ra — ngày mà không ai còn nhớ tới chỗ này.
 */
test('vai ngoài role_names không bị lượt chuyển xoá mất', () => {
  const roleCu = {
    writer: { provider: 'openai', model: 'cx/gpt-5.5' },
    // Vai server chưa khai là đổi được — giao diện không vẽ nó, nhưng nó CÓ trong cấu hình.
    reviewer: { provider: 'openai', model: 'cx/gpt-5.4-mini' },
  };
  const than = thanChuyenCaDay(
    duKienChuyen({ ...DU, roles: roleCu }, 'moi', 'claude-opus-5'),
    'moi',
    roleCu,
  );

  expect(than.roles.reviewer, 'lượt chuyển đã xoá một vai mà bề mặt còn không vẽ ra').toEqual({
    provider: 'openai',
    model: 'cx/gpt-5.4-mini',
  });
  // Và vai NẰM TRONG danh sách vẫn phải bị đè bằng giá trị mới, không phải giữ nguyên bản cũ.
  expect(than.roles.writer!.provider).toBe('moi');
});

/* ── giữ nguyên ý định của vai khác (B5) ──────────────────────────────── */

const DAY_DU: CauHinhDoc = {
  ...DU,
  roles: {
    writer: { provider: '9Router', model: 'cx/gpt-5.5', reasoning_effort: 'high', fallbacks: [{ provider: 'moi', model: 'claude-opus-5' }] },
    editor: { provider: '', model: '', reasoning_effort: 'low' },
  },
};

test('vaiGuiLai: đổi một vai, mọi vai khác đi qua nguyên vẹn — kể cả fallbacks và độ suy luận', () => {
  const ra = vaiGuiLai(DAY_DU, 'architect', { provider: 'moi', model: 'claude-opus-5' });
  expect(ra.writer).toEqual(DAY_DU.roles!.writer);
  expect(ra.editor).toEqual(DAY_DU.roles!.editor);
  expect(ra.architect).toEqual({ provider: 'moi', model: 'claude-opus-5' });
});

test('vaiGuiLai: đổi model của vai có độ suy luận riêng thì GIỮ độ suy luận đó', () => {
  const ra = vaiGuiLai(DAY_DU, 'writer', { provider: 'moi', model: 'claude-opus-5' });
  expect(ra.writer).toMatchObject({ provider: 'moi', model: 'claude-opus-5', reasoning_effort: 'high' });
});

test('vaiGuiLai: gỡ đặt riêng model nhưng còn độ suy luận thì để lại mục chỉ-độ-suy-luận', () => {
  const ra = vaiGuiLai(DAY_DU, 'writer', undefined);
  expect(ra.writer).toEqual({ provider: '', model: '', reasoning_effort: 'high' });
  const ra2 = vaiGuiLai({ ...DU, roles: { writer: { provider: '9Router', model: 'cx/gpt-5.5' } } }, 'writer', undefined);
  expect(ra2).toEqual({});
});

test('hieuLucCua: mục chỉ mang độ suy luận vẫn THỪA HƯỞNG model mặc định', () => {
  expect(hieuLucCua(DAY_DU, 'editor')).toEqual({ provider: '9Router', model: 'cx/gpt-5.5' });
});

/* ── không tạo cặp rỗng / không tồn tại (B3) ──────────────────────────── */

test('"Chỉ đổi mặc định" lấy model ở dòng Mặc định của bảng — kể cả khi vừa sửa tay', () => {
  const dong = duKienChuyen(DU, 'moi', 'claude-opus-5').map((d) =>
    d.vai === 'default' ? { ...d, denModel: 'cx/gpt-5.4-mini' } : d,
  );
  expect(thanChiDoiMacDinh(dong, 'moi')).toEqual({ provider: 'moi', model: 'cx/gpt-5.4-mini' });
});

test('khaiThemNeuThieu: chỉ khai tên CHƯA có, giữ nguyên mục cũ, kèm cửa sổ nếu biết', () => {
  const du: CauHinhDoc = { ...DU, providers: [{ name: 'p', api_key_set: true, models: [{ name: 'a', context_window: 10, json_schema: true }] }] };
  expect(khaiThemNeuThieu(du, 'p', 'a')).toBeUndefined();
  expect(khaiThemNeuThieu(du, 'p', ['b', 'a', 'b'], (m) => (m === 'b' ? 99 : 0))).toEqual({
    name: 'p',
    models: [{ name: 'a', context_window: 10, json_schema: true }, { name: 'b', context_window: 99 }],
  });
  // Nhà cung cấp không khai model nào: server không có cơ sở chặn, đừng bịa danh sách.
  expect(khaiThemNeuThieu({ ...du, providers: [{ name: 'p', api_key_set: true }] }, 'p', 'x')).toBeUndefined();
});

/* ── xóa nhà cung cấp gỡ sạch tham chiếu (B9) ─────────────────────────── */

test('thanXoaNhaCungCap: gỡ vai trỏ vào nó, lọc fallback trỏ vào nó, giữ độ suy luận', () => {
  const than = thanXoaNhaCungCap(DAY_DU, '9Router');
  expect(than.remove_provider).toBe('9Router');
  expect(than.roles).toEqual({
    writer: { provider: '', model: '', reasoning_effort: 'high' },
    editor: { provider: '', model: '', reasoning_effort: 'low' },
  });
  const than2 = thanXoaNhaCungCap(DAY_DU, 'moi');
  expect(than2.roles!.writer!.fallbacks).toEqual([]);
});
