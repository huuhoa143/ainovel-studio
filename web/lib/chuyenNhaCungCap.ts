import type { SuaCauHinh } from './api';
import type { CauHinhDoc, MucModel, MucVai } from './types';

/**
 * Luật của màn Model & khóa API — phần không có DOM.
 *
 * # Vì sao luật nằm riêng một mô-đun
 *
 * Ca thật của người dùng: *"đang dùng nhà cung cấp A, hết tiền, mua nhà cung cấp B"*. Một tên
 * model chỉ có nghĩa BÊN TRONG một nhà cung cấp — `cx/gpt-5.5` là model của 9Router, ở
 * `gateway.dichvuright.ai` nó không mang nghĩa gì. Mọi lượt ghi trên màn này vì thế phải đi
 * theo CẶP provider/model, và phải gửi lại nguyên vẹn những gì nó không đổi: `PUT /api/config`
 * thay CẢ map `roles`.
 *
 * Tách khỏi component vì đây là toàn bộ phần có luật, và luật thì phải kiểm được bằng bảng ca
 * chứ không bằng cách dựng một hộp thoại rồi bấm.
 */

/** Một dòng trong bảng đối chiếu trước khi ghi. */
export interface DongChuyen {
  /** `default` | `architect` | `writer` | `editor`. */
  vai: string;
  /** Nhà cung cấp và model ĐANG có hiệu lực cho vai này. */
  tuProvider: string;
  tuModel: string;
  /** Model đề xuất ở nhà cung cấp đích. Người dùng sửa được trước khi xác nhận. */
  denModel: string;
  /** Nhà cung cấp đích CÓ đúng tên model cũ hay không. `false` = phải chọn lại. */
  giuDuocTen: boolean;
  /** Vai này đang ĐẶT RIÊNG model (có cặp trong `cfg.Roles`) hay đang thừa hưởng mặc định. */
  dangGhim: boolean;
}

/** Vai có ĐẶT RIÊNG model không. Mục chỉ mang độ suy luận không tính là đặt riêng model. */
export function coGhimModel(r: MucVai | undefined): boolean {
  return !!r && !!r.provider && !!r.model;
}

/** Nhà cung cấp và model đang có hiệu lực cho một vai. */
export function hieuLucCua(du: CauHinhDoc, vai: string): { provider: string; model: string } {
  const r = vai === 'default' ? undefined : du.roles?.[vai];
  return coGhimModel(r) ? { provider: r!.provider, model: r!.model } : { provider: du.provider, model: du.model };
}

/** Tên model nhà cung cấp đã LƯU trong cấu hình. */
export function modelKhaiCua(du: CauHinhDoc, provider: string): string[] {
  return (du.providers.find((p) => p.name === provider)?.models ?? []).map((m) => m.name);
}

/**
 * Những vai đang thật sự gọi tới một nhà cung cấp, kể cả vai THỪA HƯỞNG mặc định.
 *
 * Đếm mỗi vai đặt riêng sẽ cho ra "chưa vai nào dùng" trên đúng nhà cung cấp đang gánh cả dây
 * chuyền, và người dùng bấm Xóa nó mà không thấy gì cản.
 */
export function vaiDungNhaCungCap(du: CauHinhDoc, ten: string): string[] {
  return du.role_names.filter((vai) => hieuLucCua(du, vai).provider === ten);
}

/**
 * Map `roles` ĐẦY ĐỦ sau khi đổi đúng một vai.
 *
 * `giaTri` vắng = gỡ đặt riêng MODEL của vai đó (độ suy luận riêng, nếu có, vẫn giữ). Mọi vai
 * khác đi qua NGUYÊN VẸN — kể cả `fallbacks` và `reasoning_effort`. Bản trước chép lại mỗi
 * `{provider, model}`, nên một lượt lưu ở vai này lặng lẽ xóa fallback và độ suy luận của mọi
 * vai còn lại.
 */
export function vaiGuiLai(
  du: CauHinhDoc,
  doiVai: string,
  giaTri: { provider: string; model: string } | undefined,
): Record<string, MucVai> {
  const ra: Record<string, MucVai> = {};
  for (const [k, v] of Object.entries(du.roles ?? {})) ra[k] = { ...v };
  const cu = ra[doiVai];
  if (giaTri) {
    ra[doiVai] = { ...(cu ?? {}), provider: giaTri.provider, model: giaTri.model };
  } else if (cu) {
    // Fallback chỉ có nghĩa cạnh một model chính; gỡ model thì gỡ luôn nó.
    const { fallbacks: _bo, ...conLai } = cu;
    void _bo;
    if (conLai.reasoning_effort) ra[doiVai] = { ...conLai, provider: '', model: '' };
    else delete ra[doiVai];
  }
  return ra;
}

/**
 * `provider_config` khai thêm một model mà nhà cung cấp phục vụ nhưng cấu hình chưa lưu.
 *
 * Server từ chối cặp provider/model mà nhà cung cấp không khai — đó là hàng rào chặn cặp không
 * tồn tại. Chọn một model vừa tải từ nhà cung cấp thì khai nó trong CÙNG lượt ghi. `undefined`
 * khi tên đã có (hoặc nhà cung cấp không khai gì, tức server không có cơ sở để chặn).
 */
export function khaiThemNeuThieu(
  du: CauHinhDoc,
  provider: string,
  model: string | string[],
  cuaSo?: (model: string) => number,
): SuaCauHinh['provider_config'] | undefined {
  const ds: MucModel[] = du.providers.find((p) => p.name === provider)?.models ?? [];
  const moi = Array.from(new Set(Array.isArray(model) ? model : [model])).filter(
    (m) => m && !ds.some((x) => x.name === m),
  );
  if (ds.length === 0 || moi.length === 0) return undefined;
  return {
    name: provider,
    // Mục cũ đi NGUYÊN VẸN (context_window, json_schema); chỉ mục mới mới là mục trần.
    models: [
      ...ds,
      ...moi.map((m) => {
        const w = cuaSo?.(m) ?? 0;
        return w > 0 ? { name: m, context_window: w } : { name: m };
      }),
    ],
  };
}

/** Thân ghi khi chọn một model cho một vai (hoặc cho mặc định). */
export function thanChonModel(
  du: CauHinhDoc,
  vai: string,
  provider: string,
  model: string,
  cuaSo?: (model: string) => number,
): SuaCauHinh {
  const khai = khaiThemNeuThieu(du, provider, model, cuaSo);
  const than: SuaCauHinh =
    vai === 'default' ? { provider, model } : { roles: vaiGuiLai(du, vai, { provider, model }) };
  if (khai) than.provider_config = khai;
  return than;
}

/**
 * Thân ghi khi xóa một nhà cung cấp: gỡ luôn mọi vai trỏ vào nó, kể cả trong `fallbacks`.
 *
 * Để lại một vai trỏ vào nhà cung cấp đã xóa thì `NewModelSet` hỏng và không mở được engine
 * cho bất kỳ cuốn nào. Server kiểm và từ chối, nhưng người dùng không nên phải tự dọn.
 */
export function thanXoaNhaCungCap(du: CauHinhDoc, ten: string): SuaCauHinh {
  const roles: Record<string, MucVai> = {};
  for (const [k, v] of Object.entries(du.roles ?? {})) {
    const fallbacks = v.fallbacks?.filter((f) => f.provider !== ten);
    const muc: MucVai = { ...v, ...(v.fallbacks ? { fallbacks } : {}) };
    if (v.provider === ten) {
      if (!v.reasoning_effort) continue;
      roles[k] = { reasoning_effort: v.reasoning_effort, provider: '', model: '' };
      continue;
    }
    roles[k] = muc;
  }
  return { remove_provider: ten, roles };
}

/** Vai đang chọn riêng model ở một nhà cung cấp cụ thể. */
export function vaiGhimO(du: CauHinhDoc, ten: string): string[] {
  return Object.entries(du.roles ?? {})
    .filter(([, v]) => coGhimModel(v) && v.provider === ten)
    .map(([k]) => k);
}

/**
 * Dựng bảng đối chiếu cho một lượt chuyển sang `denProvider`.
 *
 * Đề xuất theo đúng một luật: TÊN TRÙNG THÌ GIỮ, không thì rơi về model mặc định của nhà cung
 * cấp đích. `goiY` là danh sách model của nơi đến (đã lưu + vừa tải); vắng thì dùng danh sách
 * đã lưu.
 */
export function duKienChuyen(
  du: CauHinhDoc,
  denProvider: string,
  denModel: string,
  goiY?: string[],
): DongChuyen[] {
  const khai = goiY ?? modelKhaiCua(du, denProvider);
  return du.role_names.map((vai) => {
    const { provider, model } = hieuLucCua(du, vai);
    const giuDuocTen = vai !== 'default' && khai.includes(model);
    return {
      vai,
      tuProvider: provider,
      tuModel: model,
      denModel: vai === 'default' ? denModel : giuDuocTen ? model : denModel,
      giuDuocTen: vai === 'default' ? true : giuDuocTen,
      dangGhim: vai !== 'default' && coGhimModel(du.roles?.[vai]),
    };
  });
}

/** Có vai nào ĐẶT RIÊNG mà đang ở một nhà cung cấp khác đích đến không. */
export function coVaiLacCho(du: CauHinhDoc, denProvider: string): boolean {
  return Object.values(du.roles ?? {}).some((r) => coGhimModel(r) && r.provider !== denProvider);
}

/**
 * Thân yêu cầu ghi cho lượt chuyển CẢ dây chuyền.
 *
 * Ghi `roles` ĐẦY ĐỦ, bắt đầu từ map CŨ: khóa nào có trong `cfg.Roles` mà không nằm trong
 * `dong` vẫn phải sống sót, và mục được đổi giữ nguyên `reasoning_effort`. Vai `default` KHÔNG
 * vào map `roles` — nó là `cfg.Provider` + `cfg.ModelName`.
 */
export function thanChuyenCaDay(
  dong: DongChuyen[],
  denProvider: string,
  roleCu?: Record<string, MucVai> | null,
): { provider: string; model: string; roles: Record<string, MucVai> } {
  const macDinh = dong.find((d) => d.vai === 'default');
  const modelMacDinh = macDinh?.denModel ?? '';
  const roles: Record<string, MucVai> = {};
  for (const [k, v] of Object.entries(roleCu ?? {})) roles[k] = { ...v };
  for (const d of dong) {
    if (d.vai === 'default') continue;
    // KHÔNG đẻ ra ghim mới: vai đang thừa hưởng mà vẫn dùng đúng model mặc định thì tiếp tục
    // thừa hưởng. Ghi nó vào `cfg.Roles` là nó thôi đi theo mọi lần đổi mặc định về sau.
    if (!d.dangGhim && d.denModel === modelMacDinh) continue;
    // Trải mục cũ rồi mới đè cặp: `fallbacks` và `reasoning_effort` là ý định riêng của vai,
    // lượt chuyển không có quyền xóa chúng.
    roles[d.vai] = { ...(roles[d.vai] ?? {}), provider: denProvider, model: d.denModel };
  }
  return { provider: denProvider, model: modelMacDinh, roles };
}

/** Thân "Chỉ đổi mặc định": lấy model ở dòng Mặc định của bảng — kể cả khi người dùng vừa sửa. */
export function thanChiDoiMacDinh(dong: DongChuyen[], denProvider: string): SuaCauHinh {
  return { provider: denProvider, model: dong.find((d) => d.vai === 'default')?.denModel ?? '' };
}
