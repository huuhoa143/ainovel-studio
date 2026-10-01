'use client';

import { useState } from 'react';

import { luuCauHinh, type SuaCauHinh } from '@/lib/api';
import { CH } from '@/lib/chu/cau-hinh';
import {
  coGhimModel,
  coVaiLacCho,
  hieuLucCua,
  modelKhaiCua,
  thanChonModel,
  vaiGuiLai,
} from '@/lib/chuyenNhaCungCap';
import { type ModelNapVe } from '@/lib/modelNapVe';
import { nhanKenhVai } from '@/lib/nhan';
import type { CauHinhDoc } from '@/lib/types';

import { ChonModel, type NhomModel } from './ChonModel';
import { ChuyenNhaCungCap } from './ChuyenNhaCungCap';
import { TrangThaiLuu, useTrangThaiLuu } from './TrangThaiLuu';

/**
 * Thẻ "Đang dùng" — câu trả lời cho "truyện sẽ viết bằng gì".
 *
 * # Vì sao đây là điểm nhấn của màn
 *
 * Người dùng mở màn này để biết và đổi MODEL, không phải để quản lý khóa. Bản trước đặt danh
 * sách nhà cung cấp lên đầu, rồi bốn ô kênh (mỗi ô một select nhà cung cấp + một ô gõ model +
 * một nút Lưu), rồi một khối "Mặc định" nữa — ba chỗ chọn model, và không chỗ nào nói gọn
 * "đang viết bằng gì". Giờ một thẻ: model mặc định to rõ, rồi một dòng cho mỗi vai.
 *
 * # Ba luật giữ nguyên từ bản trước
 *
 *   1. Vai chưa đặt riêng hiện GIÁ TRỊ THỪA HƯỞNG, kèm nhãn "theo mặc định" — không hiện ô rỗng.
 *   2. Lưu một vai gửi map `roles` ĐẦY ĐỦ, giữ `fallbacks` và `reasoning_effort` của mọi vai
 *      (`vaiGuiLai`).
 *   3. Điều phối không có ô chọn: `host.arbiterModel` luôn dùng model mặc định. Nó vẫn có một
 *      dòng, vì "Điều phối dùng gì" là câu người dùng hỏi thật.
 */
export function KenhVaiChung({
  du,
  napVe,
  onXong,
}: {
  du: CauHinhDoc;
  napVe: ModelNapVe;
  /** Gọi sau mỗi lượt lưu — chủ sở hữu dữ liệu nạp lại và báo lên trên. */
  onXong: () => void;
}) {
  const nhom = nhomModel(du, napVe);
  const ttMacDinh = useTrangThaiLuu();
  const [hoiChuyen, datHoiChuyen] = useState<{ provider: string; model: string } | null>(null);
  const ttChuyen = useTrangThaiLuu();
  const vaiRieng = du.role_names.filter((v) => v !== 'default');
  const coMacDinh = !!du.provider && !!du.model;

  const ghiMacDinh = (than: SuaCauHinh) => ttMacDinh.chay(() => luuCauHinh(than), onXong);

  const chonMacDinh = (provider: string, model: string) => {
    if (provider === du.provider && model === du.model) return;
    // Còn vai ĐẶT RIÊNG ở nhà cung cấp khác → câu hỏi thật có ba đáp án. Không còn thì đổi
    // thẳng: các vai theo mặc định đổi theo ngay trên chính thẻ này, nhìn thấy được.
    if (provider !== du.provider && coVaiLacCho(du, provider)) {
      ttChuyen.xoaLoi();
      datHoiChuyen({ provider, model });
      return;
    }
    void ghiMacDinh(thanChonModel(du, 'default', provider, model, (m) => napVe.cuaSoCua(provider, m)));
  };

  const ghiChuyen = (than: SuaCauHinh) =>
    ttChuyen.chay(
      () => luuCauHinh(than),
      () => {
        datHoiChuyen(null);
        onXong();
      },
    );

  return (
    <section className="the chDangDung" aria-labelledby="ch-dang-dung">
      <div className="chDauThe">
        <h2 id="ch-dang-dung">{CH.dangDung}</h2>
        <span className="phu">{CH.dangDungPhu}</span>
      </div>

      <div className="chMacDinh">
        <div className="chMacDinhChu">
          <span className="nhan">{CH.modelMacDinh}</span>
          {coMacDinh ? (
            <span className="chCap lon">
              <span className="ncc">{du.provider}</span>
              <span className="cham" aria-hidden="true">
                ·
              </span>
              <span className="model">{du.model}</span>
            </span>
          ) : (
            <span className="chCap lon trong">{CH.chuaChonMacDinh}</span>
          )}
          <span className="phu">{CH.macDinhGiaiThich}</span>
          <CanhCap du={du} napVe={napVe} provider={du.provider} model={du.model} />
        </div>
        <div className="chMacDinhNut">
          <ChonModel
            chinh
            nhom={nhom}
            dangChon={{ provider: du.provider, model: du.model }}
            nhanNut={CH.doiModel}
            nhanTruyCap={`${CH.doiModel} — ${CH.modelMacDinh}`}
            onChon={chonMacDinh}
            onTai={napVe.nap}
            tat={ttMacDinh.dang}
          />
          <TrangThaiLuu tt={ttMacDinh.tt} />
        </div>
      </div>

      <div className="chBangVai" role="table" aria-label={CH.vai}>
        {vaiRieng.map((v) => (
          <DongVai key={v} vai={v} du={du} nhom={nhom} napVe={napVe} onXong={onXong} />
        ))}
        <div className="chDongVai" role="row">
          <span className="chTenVai" role="rowheader">
            {CH.dieuPhoi}
          </span>
          <span className="chCap" role="cell">
            <span className="ncc">{du.provider}</span>
            <span className="cham" aria-hidden="true">
              ·
            </span>
            <span className="model">{du.model}</span>
          </span>
          <span role="cell">
            <span className="vien">{CH.luonTheoMacDinh}</span>
          </span>
          <span className="chNutVai" role="cell" />
        </div>
      </div>

      {hoiChuyen ? (
        <ChuyenNhaCungCap
          du={du}
          den={hoiChuyen}
          goiY={[...modelKhaiCua(du, hoiChuyen.provider), ...napVe.modelCua(hoiChuyen.provider)]}
          cuaSo={(m) => napVe.cuaSoCua(hoiChuyen.provider, m)}
          dangGui={ttChuyen.dang}
          loi={ttChuyen.tt.loai === 'loi' ? ttChuyen.tt.loi : null}
          onHuy={() => datHoiChuyen(null)}
          onChiDoiMacDinh={ghiChuyen}
          onChuyenCaDay={ghiChuyen}
        />
      ) : null}
    </section>
  );
}

/** Một dòng vai: model đang có hiệu lực, nguồn (theo mặc định / đặt riêng), và hai thao tác. */
function DongVai({
  vai,
  du,
  nhom,
  napVe,
  onXong,
}: {
  vai: string;
  du: CauHinhDoc;
  nhom: NhomModel[];
  napVe: ModelNapVe;
  onXong: () => void;
}) {
  const tt = useTrangThaiLuu();
  const muc = du.roles?.[vai];
  const rieng = coGhimModel(muc);
  const { provider, model } = hieuLucCua(du, vai);
  const ten = nhanKenhVai(vai);

  const ghi = (than: SuaCauHinh) => void tt.chay(() => luuCauHinh(than), onXong);

  return (
    <div className={`chDongVai${rieng ? ' rieng' : ''}`} role="row">
      <span className="chTenVai" role="rowheader">
        {ten}
      </span>
      <span className="chCap" role="cell">
        <span className="ncc">{provider}</span>
        <span className="cham" aria-hidden="true">
          ·
        </span>
        <span className="model">{model}</span>
        {muc?.reasoning_effort ? <span className="phu"> · {CH.coDoSuyLuan(muc.reasoning_effort)}</span> : null}
        <CanhCap du={du} napVe={napVe} provider={provider} model={model} />
      </span>
      <span role="cell">
        <span className={`vien${rieng ? ' gold' : ''}`}>{rieng ? CH.datRieng : CH.theoMacDinh}</span>
      </span>
      <span className="chNutVai" role="cell">
        <TrangThaiLuu tt={tt.tt} />
        <ChonModel
          nhom={nhom}
          dangChon={{ provider, model }}
          nhanNut={rieng ? CH.doiRieng : CH.chonRieng}
          nhanTruyCap={`${CH.doiModel} — ${ten}`}
          onChon={(p, m) => {
            if (rieng && p === provider && m === model) return;
            ghi(thanChonModel(du, vai, p, m, (x) => napVe.cuaSoCua(p, x)));
          }}
          onTai={napVe.nap}
          tat={tt.dang}
        />
        {rieng ? (
          <button
            type="button"
            className="nutPhu"
            disabled={tt.dang}
            onClick={() => ghi({ roles: vaiGuiLai(du, vai, undefined) })}
          >
            {CH.dungMacDinh}
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Cảnh báo cặp đang dùng không còn đúng.
 *
 * Hai nguồn, hai mức chắc: so với danh sách ĐÃ LƯU (nói được ngay, "không còn trong danh
 * sách"), và so với danh sách VỪA TẢI từ nhà cung cấp (chỉ sau khi tải, "không có model này").
 * Nhà cung cấp không khai gì thì không có cơ sở để nói.
 */
function CanhCap({
  du,
  napVe,
  provider,
  model,
}: {
  du: CauHinhDoc;
  napVe: ModelNapVe;
  provider: string;
  model: string;
}) {
  if (!provider || !model) return null;
  const tai = napVe.modelCua(provider);
  if (napVe.daHoi(provider) && tai.length > 0 && !tai.includes(model)) {
    return <span className="vien red chCanh">{CH.modelKhongCoThat}</span>;
  }
  const khai = modelKhaiCua(du, provider);
  if (khai.length > 0 && !khai.includes(model)) {
    return <span className="vien amber chCanh">{CH.modelChuaKhai}</span>;
  }
  return null;
}

/** Danh sách cho ô chọn model: mọi nhà cung cấp, mặc định lên đầu. */
export function nhomModel(du: CauHinhDoc, napVe: ModelNapVe): NhomModel[] {
  return [...du.providers]
    .sort((a, b) => Number(b.name === du.provider) - Number(a.name === du.provider) || a.name.localeCompare(b.name))
    .map((n) => {
      const coKhoa = n.api_key_set || !!n.api_key_optional;
      return {
        provider: n.name,
        daKhai: (n.models ?? []).map((m) => m.name),
        daTai: napVe.modelCua(n.name),
        tat: coKhoa ? undefined : CH.chuaCoKhoaNhom,
        taiDuoc: coKhoa,
        dangTai: napVe.dangNapCua(n.name),
        daTaiLan: napVe.daHoi(n.name),
        loi: napVe.loiCua(n.name),
      };
    });
}
