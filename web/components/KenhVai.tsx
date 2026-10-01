'use client';

import { useEffect, useState } from 'react';

import { LoiApi, doiVaiModel, layVaiModel, moMay } from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';
import { CHU, GIAI_THICH, nhanKenhVai } from '@/lib/nhan';
import type { KenhVaiMuc, VaiModelDoc } from '@/lib/types';

import { ChonModel, type NhomModel } from './ChonModel';
import { TrangThaiLuu, useTrangThaiLuu } from './TrangThaiLuu';

/**
 * Model theo vai của một phiên ĐANG MỞ — bản web của `/model` trong TUI.
 *
 * # Vì sao đòi engine đang mở
 *
 * `Host.SwitchModel` dựng lại model set của engine đang chạy rồi VÁ đúng trường đó trong tệp
 * cấu hình. Không có engine thì không có gì để dựng lại; đổi mặc định cho lượt sau là việc
 * của màn Model & khóa API.
 *
 * # Vì sao chọn bằng một ô cho cả cặp
 *
 * Ô Nhà cung cấp và ô Model độc lập là đúng cách đã dựng ra `openai · cx/gpt-5.5`: đổi nhà
 * cung cấp mà ô Model giữ tên cũ. `ChonModel` nhóm model theo nhà cung cấp, nên cặp đi cùng nhau.
 *
 * `arbiter` cố ý KHÔNG có ô: `host.arbiterModel` luôn dùng model mặc định.
 */
export function KenhVai({
  tacPham,
  khoiDong,
}: {
  tacPham: string | undefined;
  /** `provider · model` mà engine ĐÃ khởi động, để nói ra khi nó đã lệch so với hiện tại. */
  khoiDong?: string;
}) {
  const [du, datDu] = useState<VaiModelDoc | null>(null);
  const [loi, datLoi] = useState<{ thongDiep: string; chuaMoMay: boolean } | null>(null);

  const tai = () => {
    if (!tacPham) return;
    layVaiModel(tacPham)
      .then((d) => {
        datDu(d);
        datLoi(null);
      })
      .catch((e: unknown) => {
        // 409 = chưa mở engine — trạng thái bình thường, không phải lỗi cần báo đỏ.
        const chuaMo = e instanceof LoiApi && e.status === 409;
        datLoi({ thongDiep: e instanceof Error ? e.message : String(e), chuaMoMay: chuaMo });
        datDu(null);
      });
  };
  useEffect(tai, [tacPham]);

  if (loi?.chuaMoMay) {
    return (
      <section className="sect kenhVaiPhien">
        {/* KHÔNG dùng "Đang viết bằng" ở đây: chưa có gì chạy. */}
        <h2>{CHU.mayDangDong}</h2>
        <p className="trongSect">{GIAI_THICH.kenhVaiCanMayMo}</p>
        {/* Nút MỞ, không phải nút Chạy: mở engine không gọi LLM lần nào. */}
        <MoMayNut tacPham={tacPham} onXong={tai} />
      </section>
    );
  }
  if (loi) {
    return (
      <section className="sect kenhVaiPhien">
        <h2>{CHU.kenhVai}</h2>
        <p className="loiDoc">{loi.thongDiep}</p>
      </section>
    );
  }
  if (!du || !tacPham) return null;

  const macDinh = du.channels.find((k) => k.role === 'default');
  const dangChay = macDinh ? `${macDinh.provider} · ${macDinh.model}` : undefined;
  const daDoi = !!khoiDong && !!dangChay && khoiDong !== dangChay;
  const nhom: NhomModel[] = du.providers.map((p) => ({
    provider: p,
    daKhai: du.models_by_provider[p] ?? [],
    daTai: [],
    taiDuoc: false,
    dangTai: false,
    daTaiLan: true,
    loi: null,
  }));

  return (
    <section className="sect kenhVaiPhien">
      <h2>{CHU.kenhVai}</h2>
      {/* Lưu ở đây ăn ngay VÀ ghi xuống tệp cấu hình — vế thứ hai không đoán được từ giao diện. */}
      <p className="steerhint">{GIAI_THICH.kenhVaiAnNgayVaGhi}</p>
      {daDoi ? (
        <p className="vphacap">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          <span>{GIAI_THICH.kenhVaiDaDoiSoVoiKhoiDong(khoiDong!, dangChay!)}</span>
        </p>
      ) : null}
      <div className="chBangVai" role="table" aria-label={CHU.kenhVai}>
        {du.channels.map((k) => (
          <MotKenh key={k.role} tacPham={tacPham} k={k} nhom={nhom} onXong={tai} />
        ))}
      </div>
    </section>
  );
}

/** Mở engine để dải kênh dùng được, không kèm một lượt chạy nào. */
function MoMayNut({ tacPham, onXong }: { tacPham: string | undefined; onXong: () => void }) {
  const tt = useTrangThaiLuu();
  if (!tacPham) return null;
  return (
    <div className="chHangNut">
      <button
        type="button"
        className="nutPhu"
        disabled={tt.dang}
        onClick={() => void tt.chay(() => moMay(tacPham), onXong)}
      >
        {tt.dang ? CH.phienDangMoMo : CHU.moMay}
      </button>
      {tt.tt.loai === 'loi' ? <TrangThaiLuu tt={tt.tt} /> : null}
    </div>
  );
}

function MotKenh({
  tacPham,
  k,
  nhom,
  onXong,
}: {
  tacPham: string;
  k: KenhVaiMuc;
  nhom: NhomModel[];
  onXong: () => void;
}) {
  const tt = useTrangThaiLuu();
  const ten = nhanKenhVai(k.role);
  // Chỉ có ô độ suy luận khi model này có MỨC THẬT để chọn. `[""]` là "không có gì để chọn" —
  // bản trước vẫn vẽ một ô chọn chỉ chứa một dòng trống.
  const mucThat = k.thinking_options.filter((m) => m !== '');

  const gui = (than: { provider?: string; model?: string; thinking?: string }) =>
    void tt.chay(() => doiVaiModel(tacPham, { role: k.role, ...than }), onXong);

  return (
    <div className={`chDongVai${k.explicit && k.role !== 'default' ? ' rieng' : ''}`} role="row">
      <span className="chTenVai" role="rowheader">
        {ten}
      </span>
      <span className="chCap" role="cell">
        <span className="ncc">{k.provider}</span>
        <span className="cham" aria-hidden="true">
          ·
        </span>
        <span className="model">{k.model}</span>
      </span>
      <span role="cell">
        {k.role === 'default' ? null : (
          <span className={`vien${k.explicit ? ' gold' : ''}`}>{k.explicit ? CH.datRieng : CH.theoMacDinh}</span>
        )}
      </span>
      <span className="chNutVai" role="cell">
        <TrangThaiLuu tt={tt.tt} />
        {mucThat.length > 0 ? (
          <select
            aria-label={`${CHU.doSuyLuan} — ${ten}`}
            value={k.thinking}
            disabled={tt.dang}
            onChange={(e) => gui({ thinking: e.target.value })}
          >
            {k.thinking_options.map((m) => (
              <option key={m} value={m}>
                {m || CH.theoModel}
              </option>
            ))}
          </select>
        ) : null}
        <ChonModel
          nhom={nhom}
          dangChon={{ provider: k.provider, model: k.model }}
          nhanNut={CH.doiRieng}
          nhanTruyCap={`${CH.doiModel} — ${ten}`}
          onChon={(p, m) => {
            if (p === k.provider && m === k.model) return;
            gui({ provider: p, model: m });
          }}
          onTai={() => {}}
          tat={tt.dang}
        />
      </span>
    </div>
  );
}
