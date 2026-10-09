'use client';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { so, tongTien } from '@/lib/dinhdang';
import { CHU, GIAI_THICH, nhanVai } from '@/lib/nhan';
import { tienCuaXuong, type TaiTongXuong } from '@/lib/tongXuong';

import { OSo, PhanBo } from './ChiPhi';
import { HoSoKhung } from './HoSoKhung';

/**
 * Chi phí TOÀN XƯỞNG — bổ theo vai và theo model.
 *
 * # Vì sao bề mặt này chỉ tồn tại được từ bản này
 *
 * `/api/books/{b}/cost` là per-book. Cộng ở web nghĩa là N lượt gọi mỗi lần mở màn, và hai
 * người xem cùng lúc sẽ thấy hai con số khác nhau vì N lượt ấy không cùng một thời điểm. Nên
 * phép cộng phải ở server, và `GET /api/workshop/cost` là route mới làm việc đó.
 *
 * # Hai câu bề mặt này BẮT BUỘC phải nói ra
 *
 *   1. **Mẫu số.** Đo trên xưởng thật: tổng `$7,37` với `counted: 1` trên ba cuốn — hai cuốn
 *      còn lại chưa có `meta/usage.json`. Một con số tiền không kèm mẫu số sẽ được đọc thành
 *      "cả xưởng tốn có thế", và người vận hành sẽ lập ngân sách theo nó.
 *   2. **Số lượt thiếu usage.** `missing_assistant_usage` lớn nghĩa là MỌI con số ở đây đều
 *      thiếu một phần. Im lặng về nó là để người dùng tin một tổng bị hụt.
 *
 * # Vì sao các thanh KHÔNG phải trang trí
 *
 * Câu hỏi thật của bề mặt này là "tiền đi đâu", và câu trả lời là một tỉ lệ — Writer thường
 * ăn 60–90%. Thanh trả lời nó bằng một cú nhìn. Thanh và ô số dùng chung `PhanBo` / `OSo`
 * với màn Chi phí của một truyện, để hai màn đọc cùng một hình và giữ cùng một luật mốc.
 */
export function ChiPhiXuong({ tong }: { tong: TaiTongXuong }) {
  if (tong.loi) {
    return (
      <HoSoKhung tieuDe={CHU.chiPhiXuong}>
        <section className="vh">
          <div className="the vhTrong">
            <h2>{GIAI_THICH.nguonKhongDocDuocTieuDe}</h2>
            <p className="trongSect">{GIAI_THICH.nguonKhongDocDuoc}</p>
            <p className="loiDoc">{tong.loi}</p>
          </div>
        </section>
      </HoSoKhung>
    );
  }
  if (tong.dangTai) {
    return (
      <HoSoKhung tieuDe={CHU.chiPhiXuong}>
        <section className="vh">
          <div className="the vhTrong">
            <p className="trongSect">{CHU_VH.dangCongChiPhi}</p>
          </div>
        </section>
      </HoSoKhung>
    );
  }

  const tien = tienCuaXuong(tong.du);
  if (!tong.du || !tien) {
    return (
      <HoSoKhung tieuDe={CHU.chiPhiXuong}>
        <section className="vh">
          <div className="the vhTrong">
            <p className="trongSect">{GIAI_THICH.chiPhiXuongChuaCoGi}</p>
          </div>
        </section>
      </HoSoKhung>
    );
  }

  const con = Math.max(0, tien.tongSach - tien.demDuoc);

  return (
    <HoSoKhung
      tieuDe={CHU.chiPhiXuong}
      motTa={
        tien.tongSach > 0 && tien.demDuoc < tien.tongSach
          ? tien.demDuoc === 0
            ? CHU.chuaDoDuocCuonNao
            : CHU.doDuocO(tien.demDuoc, tien.tongSach)
          : undefined
      }
    >
      <div className="vh vhChiPhi">
        <div className="vhSo">
          <OSo
            nhan={CHU_VH.daTieu}
            so={tongTien(tien.chiPhi) ?? CHU.khongCo}
            phu={
              tien.tongSach > 0 && tien.demDuoc < tien.tongSach
                ? CHU.doDuocO(tien.demDuoc, tien.tongSach)
                : CHU_VH.daTieuXuong
            }
          />
          {/* Tiền cache tiết kiệm KHÔNG phải tiền trong ví mà là tiền lẽ ra phải trả nếu không
              có bộ đệm. Dòng phụ nói ra điều đó. */}
          <OSo
            nhan={CHU_VH.boDemTietKiem}
            so={tongTien(tien.tietKiem) ?? CHU.khongCo}
            phu={CHU_VH.boDemTietKiemPhu}
            mau="teal"
          />
          {/* Mẫu số của mọi con số trên: một tổng không kèm số truyện đã đo sẽ được đọc
              thành "mọi truyện tốn có thế". */}
          <OSo
            nhan={CHU_VH.truyenCoSoLieu}
            so={`${so(tien.demDuoc) ?? 0}/${so(tien.tongSach) ?? 0}`}
            phu={CHU_VH.truyenCoSoLieuPhu(con)}
          />
        </div>

        {/* Lượt thiếu usage: tin về ĐỘ TIN CẬY của mọi con số phía trên, nên nó đứng ngay
            dưới chúng chứ không ở cuối trang. */}
        <section className="the vhTin" aria-label={CHU.doTinSoLieu}>
          <div className="vhTinDong">
            {tien.thieuUsage > 0 ? (
              <span className="vien amber">
                <span aria-hidden="true">■</span>
                {CHU_VH.thieuLuot(tien.thieuUsage)}
              </span>
            ) : (
              <span className="vien teal">
                <span aria-hidden="true">●</span>
                {CHU_VH.soLieuDayDu}
              </span>
            )}
            <span className="vhTinCau">
              {tien.thieuUsage > 0
                ? GIAI_THICH.chiPhiXuongThieuUsage(tien.thieuUsage)
                : CHU_VH.soLieuDayDuCau}
            </span>
          </div>
          <p className="steerhint">{GIAI_THICH.chiPhiXuongGiaiThich}</p>
        </section>

        {/* Mỗi nhóm có MẪU SỐ RIÊNG cho thanh — xem `PhanBo`. Bản đầu dùng chung một mốc cho
            hai nhóm và một thanh model tính ra 176%, bị cắt thành một thanh đầy nói dối. */}
        <div className="vhDoi">
          <PhanBo
            tieuDe={CHU.boTheoVai}
            o={tong.du.per_agent}
            tong={tien.chiPhi}
            nhan={nhanVai}
            muc="vai"
          />
          <PhanBo
            tieuDe={CHU.boTheoModel}
            o={tong.du.per_model}
            tong={tien.chiPhi}
            mono
            muc="model"
          />
        </div>
      </div>
    </HoSoKhung>
  );
}
