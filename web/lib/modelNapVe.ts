'use client';

import { useCallback, useRef, useState } from 'react';

import { LoiApi, lietKeModel, type KetQuaCongCu } from './api';

/**
 * Danh sách model hỏi thẳng nhà cung cấp, dùng chung cho cả một màn.
 *
 * # Vì sao là hook chung chứ không phải state trong từng ô
 *
 * Màn Model theo vai có bốn kênh, và cả bốn thường trỏ về cùng một nhà cung cấp. Mỗi ô tự
 * nạp là bốn lần gọi ra ngoài cho đúng một câu trả lời — chậm hơn, và với nhà cung cấp có
 * giới hạn tần suất thì ba lần sau lãnh 429 rồi hiện lỗi ở ba ô đang không sai gì.
 *
 * # Vì sao nhớ theo TỪNG nhà cung cấp
 *
 * Model của gateway này không nói gì về gateway kia. Một `string[]` phẳng sẽ đem danh sách
 * của `openrouter` ra gợi ý cho `anthropic`, tức gợi ý toàn tên chắc chắn sai.
 *
 * LỖI cũng phải theo từng nhà cung cấp, vì cùng một lý do. Bản đầu giữ đúng một `loi` cho cả
 * hook, và nó đủ dùng khi màn chỉ hỏi một nhà cung cấp. Màn Nhà cung cấp & khóa thì hỏi
 * NHIỀU — mỗi thẻ một cái — nên một ô lỗi chung sẽ dán lỗi 401 của `kiraai` lên cả thẻ
 * `openai` đang hoàn toàn khỏe.
 *
 * # Vì sao hỏng thì XÓA danh sách cũ
 *
 * Hỏng nghĩa là "không biết", không phải "vẫn như cũ". Giữ lại danh sách của lượt hỏi trước
 * sẽ để `daHoi()` tiếp tục trả true sau khi khóa đã bị thu hồi — và cảnh báo "model không có
 * thật" khi đó nói về một danh sách không còn ai bảo chứng.
 */
export function useModelNapVe() {
  const [theoNcc, datTheoNcc] = useState<Record<string, string[]>>({});
  const [loiTheoNcc, datLoiTheoNcc] = useState<Record<string, string>>({});
  // Cửa sổ ngữ cảnh nhà cung cấp tự khai, nhớ theo cùng khóa với danh sách model.
  const [cuaTheoNcc, datCuaTheoNcc] = useState<Record<string, Record<string, number>>>({});
  const [dangNap, datDangNap] = useState<Record<string, true>>({});
  // Lúc lượt hỏi gần nhất VỀ (xuôi hay hỏng) — để màn hình nói "kiểm lúc 23:41" thay vì một
  // dấu ✓ không biết từ bao giờ.
  const [lucTheoNcc, datLucTheoNcc] = useState<Record<string, number>>({});
  // Kết quả lượt thử gọi công cụ — chỉ có sau nút Kiểm tra (`nap(…, { congCu: true })`).
  const [congCuTheoNcc, datCongCuTheoNcc] = useState<Record<string, KetQuaCongCu>>({});
  // Cờ đang-bay đọc bằng ref, KHÔNG bằng state: hai cú bấm liên tiếp trên cùng một nút xảy ra
  // trước khi React vẽ lại, nên đọc state ở đây sẽ thấy giá trị cũ và bắn hai lượt gọi.
  const dangBay = useRef<Set<string>>(new Set());

  const nap = useCallback((provider: string, tuyChon: { congCu?: boolean } = {}) => {
    if (!provider || dangBay.current.has(provider)) return;
    dangBay.current.add(provider);
    datDangNap((cu) => ({ ...cu, [provider]: true }));
    datLoiTheoNcc((cu) => {
      if (cu[provider] === undefined) return cu;
      const con = { ...cu };
      delete con[provider];
      return con;
    });
    lietKeModel(provider, { congCu: tuyChon.congCu })
      .then((r) => {
        datTheoNcc((cu) => ({ ...cu, [provider]: r.models }));
        if (r.windows) datCuaTheoNcc((cu) => ({ ...cu, [provider]: r.windows! }));
        if (r.tools) datCongCuTheoNcc((cu) => ({ ...cu, [provider]: r.tools! }));
      })
      .catch((e: unknown) => {
        datLoiTheoNcc((cu) => ({
          ...cu,
          [provider]: e instanceof LoiApi ? e.message : String(e),
        }));
        datTheoNcc((cu) => {
          if (cu[provider] === undefined) return cu;
          const con = { ...cu };
          delete con[provider];
          return con;
        });
      })
      .finally(() => {
        dangBay.current.delete(provider);
        datLucTheoNcc((cu) => ({ ...cu, [provider]: Date.now() }));
        datDangNap((cu) => {
          if (cu[provider] === undefined) return cu;
          const con = { ...cu };
          delete con[provider];
          return con;
        });
      });
  }, []);

  /**
   * Quên mọi thứ đã biết về một nhà cung cấp — gọi sau khi SỬA nó.
   *
   * Danh sách nhớ theo TÊN, nên đổi địa chỉ gốc hay khóa mà không quên thì màn hình tiếp tục
   * khoe danh sách của gateway cũ, cảnh báo "model không có thật" so với dữ liệu không còn ai
   * bảo chứng, và nút tải lại bị ẩn vì "đã hỏi rồi".
   */
  const xoa = useCallback((provider: string) => {
    const bo = <T,>(cu: Record<string, T>) => {
      if (cu[provider] === undefined) return cu;
      const con = { ...cu };
      delete con[provider];
      return con;
    };
    datTheoNcc(bo);
    datLoiTheoNcc(bo);
    datCuaTheoNcc(bo);
    datLucTheoNcc(bo);
    datCongCuTheoNcc(bo);
  }, []);

  return {
    nap,
    xoa,
    /** Lúc lượt hỏi gần nhất về, `undefined` khi chưa hỏi. */
    lucCua: useCallback((provider: string) => lucTheoNcc[provider], [lucTheoNcc]),
    /**
     * Nhà cung cấp NÀY có đang được hỏi không.
     *
     * Theo từng nhà cung cấp chứ không phải một cờ chung, và đó là sửa một lỗi ĐO ĐƯỢC: bản
     * trước giữ `dangNap: string | null` và mọi nút đều tắt theo nó, nên bấm Kiểm tra ở một thẻ
     * làm CẢ MÀN xám đi — người dùng đọc ra là "nó đang kiểm tất cả nhà cung cấp", trong khi
     * mạng chỉ có đúng một lượt gọi. Một điều khiển chỉ được nói về việc của chính nó.
     */
    dangNapCua: useCallback((provider: string) => dangNap[provider] === true, [dangNap]),
    /** Model đã nạp cho một nhà cung cấp. `[]` khi chưa hỏi — KHÔNG phải "không có model". */
    modelCua: useCallback((provider: string) => theoNcc[provider] ?? [], [theoNcc]),
    /** Đã hỏi được nhà cung cấp này chưa — điều kiện để dám nói "model không có thật". */
    daHoi: useCallback((provider: string) => theoNcc[provider] !== undefined, [theoNcc]),
    /**
     * Cửa sổ ngữ cảnh nhà cung cấp tự khai cho một model, `0` khi không khai.
     *
     * Nguồn ĐÚNG cho việc nén ngữ cảnh: registry toàn cục nói về model gốc của hãng, còn
     * gateway có trần riêng — `cx/gpt-5.6-luna` là 272.000 ở 9Router nhưng 1.050.000 ở
     * registry, và engine tin registry thì nó không nén cho tới một ngưỡng không bao giờ tới.
     */
    cuaSoCua: useCallback(
      (provider: string, model: string) => cuaTheoNcc[provider]?.[model] ?? 0,
      [cuaTheoNcc],
    ),
    /** Kết quả thử gọi công cụ gần nhất, `undefined` khi chưa bấm Kiểm tra. */
    congCuCua: useCallback((provider: string) => congCuTheoNcc[provider], [congCuTheoNcc]),
    /** Lỗi của lượt hỏi gần nhất cho một nhà cung cấp, `null` khi lượt đó xuôi. */
    loiCua: useCallback((provider: string) => loiTheoNcc[provider] ?? null, [loiTheoNcc]),
  };
}

export type ModelNapVe = ReturnType<typeof useModelNapVe>;
