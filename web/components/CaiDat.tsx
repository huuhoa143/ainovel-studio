'use client';

import { layCaiDat } from '@/lib/api';
import { CHU_VH } from '@/lib/chu/van-hanh';
import { ngayGio, so } from '@/lib/dinhdang';
import {
  CHU,
  GIAI_THICH,
  nhanCheDoTien,
  nhanMocTamDung,
  nhanMucQuyHoach,
  nhanVai,
} from '@/lib/nhan';
import type { SettingsDoc } from '@/lib/types';
import { useHoSo } from '@/lib/useHoSo';

import { HoSoKhung, tinhTrangNguon } from './HoSoKhung';
import { KenhVai } from './KenhVai';

/**
 * Phiên chạy: cuốn này được khởi động với cấu hình gì.
 *
 * # Tên cũ là "Cài đặt", và tên cũ sai
 *
 * Bề mặt này là một BẢN GHI của một cuốn — quá khứ, chỉ đọc, từ `meta/run.json`. Thứ người
 * dùng đi tìm khi gõ "cài đặt" là cấu hình máy sửa được. Bằng chứng nằm ngay trong chính tệp
 * này, ở `GIAI_THICH.kenhVaiCanMayMo`: bề mặt đã phải in ra một câu chỉ đường sang chỗ khác
 * cho việc mà người ta vào đây để làm. Một bề mặt phải chỉ đường khỏi chính nó là một bề mặt
 * mang sai tên.
 *
 * Từ bản ba màn, chữ "Cài đặt" thuộc màn Cài đặt chung (cấu hình áp cho mọi tác phẩm), và
 * bề mặt này mang tên đúng việc nó làm. Mã khu cũng đổi theo (`cai-dat` → `phien-chay`) vì mã
 * khu đi vào thanh địa chỉ, tức nó là chữ người dùng đọc — xem chú thích ở đầu lib/khu.ts.
 *
 * # Bề mặt CHỈ ĐỌC, và đó là một sự thật kỹ thuật chứ không phải việc còn tồn
 *
 * `serve` không ghi store. Lý do ở đầu internal/serve/serve.go và nó giống hệt lý
 * do ô can thiệp bị vô hiệu: engine SỞ HỮU quyền ghi `meta/run.json`. Nếu serve
 * cũng ghi thì hai tiến trình cùng sửa một tệp — engine đọc `PendingSteer`, xử lý,
 * rồi `ClearPendingSteer`; một lượt ghi chen vào giữa sẽ mất trắng ý kiến can
 * thiệp, không lỗi, không dấu vết.
 *
 * Trạng thái đó đọc từ `writable` của server, KHÔNG hard-code ở đây. Ngày engine
 * nhận lệnh ghi thì server đổi một trường và bề mặt này theo, không phải phát hành
 * lại web.
 *
 * # Vì sao không vẽ một biểu mẫu vô hiệu
 *
 * Ô can thiệp vẽ ô nhập ở trạng thái `disabled` chứ không xoá, và đó là lựa chọn
 * đúng CHO NÓ: nó có đúng một điều khiển, nên một ô xám nói được "chỗ này sẽ nhận
 * can thiệp, tìm ở đây". Cài đặt có mười trường. Mười ô xám không nói thêm gì, mà
 * chúng còn nói dối về hình dạng của bề mặt sẽ-có — một biểu mẫu sửa cấu hình phiên
 * đang chạy gần như chắc chắn không phải mười ô này. Nên ở đây là một câu, và câu
 * đó nói rõ vì sao.
 */
export function CaiDat({ tacPham }: { tacPham: string | undefined }) {
  const tai = useHoSo(tacPham, layCaiDat);
  const tt = tinhTrangNguon(tai);
  const du = tai.du;

  return (
    <HoSoKhung tieuDe={CHU.phienChayKhu} motTa={tt || !du ? undefined : motTa(du)}>
      {tt ??
        (du ? (
          du.state === 'no_file' ? (
            <section className="vh">
              <p className="the vhTrong trongSect">
                {GIAI_THICH.nguonChuaGhi(GIAI_THICH.caiDatTepNguon, GIAI_THICH.caiDatKhiNao)}
              </p>
            </section>
          ) : trongRong(du) ? (
            // Tệp CÓ mà mọi trường rỗng — khác hẳn chưa có tệp, và ta biết chắc là
            // khác vì `state` đã nói `ready`.
            <section className="vh">
              <p className="the vhTrong trongSect">
                {GIAI_THICH.nguonCoMaRong(GIAI_THICH.caiDatTepNguon, 'trường')}
              </p>
            </section>
          ) : (
            <div className="vh vhPhien">
              <PhienChay du={du} />
              {/* Dải kênh model đứng ngay sau khối "Lúc bắt đầu dùng" vì nó là thứ DUY NHẤT
                  trên bề mặt này đổi được, và nó đổi đúng cái vừa hiện phía trên (model).
                  `khoiDong` cho nó biết engine đã KHỞI ĐỘNG với gì, để nó nói ra khi hai giá
                  trị đã lệch nhau. */}
              <KenhVai
                tacPham={tacPham}
                khoiDong={du.provider && du.model ? `${du.provider} · ${du.model}` : undefined}
              />
              <TienChuong du={du} />
              <CanThiepConTon du={du} />
              <YeuCauKhoiTao du={du} />
              <PhanQuyetKhoiDong du={du} />
              <ChiDoc du={du} />
            </div>
          )
        ) : null)}
    </HoSoKhung>
  );
}

/**
 * Một nhóm khóa–giá trị: tiêu đề nhóm rồi các dòng. Mỗi dòng mang một câu giải thích bằng
 * chữ thường ngay dưới nhãn, để người dùng không phải đoán "Độ dài" hay "Đã cho phép" là gì.
 */
function Nhom({
  tieuDe,
  phu,
  children,
}: {
  tieuDe: string;
  phu?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="the vhNhom">
      <h2>
        {tieuDe}
        {phu}
      </h2>
      {children}
    </section>
  );
}

function Dong({
  nhan,
  giai,
  ma,
  title,
  children,
}: {
  nhan: string;
  giai?: string;
  /** Giá trị là mã đối chiếu được (model, mã quyết định) — chữ mono. */
  ma?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="vhKv">
      <dt title={title}>
        <span>{nhan}</span>
        {giai ? <small>{giai}</small> : null}
      </dt>
      <dd className={ma ? 'ma' : undefined}>{children}</dd>
    </div>
  );
}

function PhienChay({ du }: { du: SettingsDoc }) {
  return (
    /* "Lúc bắt đầu dùng", KHÔNG phải "Phiên chạy". Khối này đọc `run.json` — giá trị lúc mở
       máy. Ngay dưới nó là dải kênh model ĐANG SỐNG, cũng có nhãn "Model". Sau một lần đổi
       nóng thì hai con số khác nhau thật, nên tên khối phải nói ra cái nào là quá khứ. */
    <Nhom tieuDe={CHU.khoiDongVoi}>
      <dl className="vhKvDs">
        {du.started_at ? (
          <Dong nhan={CHU.batDauLuc} giai={CHU_VH.giaiBatDau}>
            {ngayGio(du.started_at) ?? du.started_at}
          </Dong>
        ) : null}
        {du.provider ? (
          <Dong nhan={CHU.nhaCungCap} giai={CHU_VH.giaiNhaCungCap}>
            {du.provider}
          </Dong>
        ) : null}
        {du.model ? (
          <Dong nhan={CHU.model} giai={CHU_VH.giaiModel} ma>
            {du.model}
          </Dong>
        ) : null}
        {/* `style` là kiểu văn chọn LÚC KHỞI ĐỘNG, khác hẳn bộ quy tắc văn phong mà Editor
            chưng ra sau ở ranh giới cung. Câu giải thích tách hai thứ ra. */}
        {du.style ? (
          <Dong nhan={CHU.kieuVan} giai={CHU_VH.giaiKieuVan} title={GIAI_THICH.caiDatKieuVanKhac}>
            {du.style}
          </Dong>
        ) : null}
        {du.planning_tier ? (
          <Dong nhan={CHU.mucQuyHoach} giai={CHU_VH.giaiDoDai}>
            {nhanMucQuyHoach(du.planning_tier)}
          </Dong>
        ) : null}
      </dl>
    </Nhom>
  );
}

/**
 * Chế độ đi tiếp chương — phần có hệ quả vận hành trực tiếp nhất của cả bề mặt.
 *
 * Ở chế độ `review`, engine dừng lại chờ người cho phép từng chương. Nên
 * `advance_permit_chapter` là câu trả lời cho "vì sao dây chuyền đứng yên", và `0`
 * ở đó là câu trả lời ĐÁNG GIÁ NHẤT: chưa cấp phép chương nào.
 *
 * Vì thế kiểm `!= null`, không kiểm falsy. Kiểm falsy thì đúng cái ca cần hiện
 * nhất là cái ca biến mất.
 */
function TienChuong({ du }: { du: SettingsDoc }) {
  if (!du.advance_mode && du.advance_permit_chapter == null && !du.advance_hold) {
    return null;
  }
  const cho = du.advance_mode === 'review';

  return (
    <Nhom tieuDe={CHU.tienChuong}>
      {/* Tạm dừng một lần là một Ý ĐỊNH đã ký, CHƯA tiêu thụ — tin sắp-xảy-ra, nên tông
          amber và đứng trên đầu nhóm chứ không lẫn trong danh sách. */}
      {du.advance_hold ? (
        <p className="vphacap">
          <span className="ky" aria-hidden="true">
            ■
          </span>
          <span>
            <strong>{CHU.tamDungSauKhi(nhanMocTamDung(du.advance_hold.after) ?? '')}.</strong>{' '}
            {GIAI_THICH.caiDatTamDung} {du.advance_hold.reason}
          </span>
        </p>
      ) : null}
      <dl className="vhKvDs">
        {du.advance_mode ? (
          <Dong nhan={CHU.cheDoTien} giai={CHU_VH.giaiCheDo}>
            {nhanCheDoTien(du.advance_mode)}
          </Dong>
        ) : null}
        {du.advance_permit_chapter != null ? (
          <Dong
            nhan={CHU.chuongDuocCapPhep}
            giai={CHU_VH.giaiCapPhep}
            title={cho ? GIAI_THICH.caiDatCapPhepReview : GIAI_THICH.caiDatCapPhepAuto}
          >
            {du.advance_permit_chapter > 0 ? (
              so(du.advance_permit_chapter)
            ) : (
              <span className={cho ? 'vien amber' : 'trong'}>{CHU.chuaCapPhepChuongNao}</span>
            )}
          </Dong>
        ) : null}
      </dl>

      {/* Ở chế độ chờ cấp phép, số 0 nghĩa là dây chuyền ĐANG ĐỨNG — nói thành câu. Ở chế độ
          tự viết thì số 0 không có nghĩa gì, nên câu nói ra điều đó để không ai lo. */}
      <p className="steerhint">
        {cho ? GIAI_THICH.caiDatCapPhepReview : GIAI_THICH.caiDatCapPhepAuto}
      </p>
    </Nhom>
  );
}

/**
 * Yêu cầu gốc của người dùng.
 *
 * `--ui`, KHÔNG serif: phép thử hỏi "chữ này có nằm trong bộ truyện xuất bản không" — đây là
 * câu người vận hành dặn engine, người đọc truyện không bao giờ thấy nó.
 */
function YeuCauKhoiTao({ du }: { du: SettingsDoc }) {
  if (!du.start_prompt) return null;
  return (
    <Nhom tieuDe={CHU.yeuCauKhoiTao}>
      <p className="vhGiai">{GIAI_THICH.caiDatYeuCau}</p>
      <p className="cdvan">{du.start_prompt}</p>
    </Nhom>
  );
}

/**
 * Ý kiến can thiệp còn tồn.
 *
 * Trường này chỉ có giá trị khi engine CHƯA tiêu thụ nó, nên sự hiện diện của nó đã là tin:
 * có một ý kiến đã ký mà dây chuyền chưa xử lý. Đứng trước "Ý tưởng ban đầu" vì nó là việc
 * đang treo, còn ý tưởng là quá khứ.
 */
function CanThiepConTon({ du }: { du: SettingsDoc }) {
  if (!du.pending_steer) return null;
  return (
    <Nhom tieuDe={CHU.canThiepConTon}>
      <p className="vphacap">
        <span className="ky" aria-hidden="true">
          ■
        </span>
        <span>{GIAI_THICH.caiDatCanThiepConTon}</span>
      </p>
      <p className="cdvan">{du.pending_steer}</p>
    </Nhom>
  );
}

/**
 * Phán quyết khởi động — sự thật mà việc khôi phục sau sập dựa vào.
 *
 * `decision_id` nối sang nhật ký quyết định, nên nó hiện dạng mã mono: nó là thứ để đối
 * chiếu, không phải để đọc. Việc đã giao dài nhiều dòng và là đọc-một-lần, nên gập lại.
 */
function PhanQuyetKhoiDong({ du }: { du: SettingsDoc }) {
  const ps = du.plan_start;
  if (!ps) return null;
  return (
    <Nhom tieuDe={CHU.phanQuyetKhoiDong}>
      <dl className="vhKvDs">
        {ps.planner ? (
          <Dong nhan={CHU.nguoiQuyHoach} giai={CHU_VH.giaiNguoiQuyHoach}>
            {nhanNguoiQuyHoach(ps.planner)}
          </Dong>
        ) : null}
        {ps.decision_id ? (
          <Dong nhan={CHU.maPhanQuyet} giai={CHU_VH.giaiMaPhanQuyet} ma>
            {ps.decision_id}
          </Dong>
        ) : null}
      </dl>
      {ps.planner_task ? (
        <details className="vhGap">
          <summary>{CHU_VH.xemViecQuyHoach}</summary>
          <p className="cdvan">{ps.planner_task}</p>
        </details>
      ) : null}
    </Nhom>
  );
}

/**
 * `planner` là mã máy kiểu `architect_long`. Tên vai đọc được thì in tên Việt kèm mức; mã lạ
 * giữ nguyên chứ không đoán.
 */
function nhanNguoiQuyHoach(planner: string): string {
  const cat = planner.indexOf('_');
  const goc = cat > 0 ? planner.slice(0, cat) : planner;
  const ten = nhanVai(goc);
  if (ten === goc) return planner;
  const muc = cat > 0 ? nhanMucQuyHoach(planner.slice(cat + 1)) : undefined;
  return muc ? `${ten} · ${muc}` : ten;
}

/**
 * Vì sao bề mặt này không sửa được.
 *
 * Đọc từ `writable`, không hard-code — và cũng KHÔNG im lặng. Một bề mặt không có gì bấm được
 * sẽ bị đọc là hỏng, trừ khi nó nói ra vì sao.
 */
function ChiDoc({ du }: { du: SettingsDoc }) {
  if (du.writable) return null;
  return (
    <section className="vhChiDoc" aria-label={CHU.chiDoc}>
      <span className="vien">{CHU.chiDoc}</span>
      <div>
        <p className="steerhint">{GIAI_THICH.caiDatChiDoc}</p>
        {/* Nói ra điều CỐ Ý không có, để không ai đi tìm nó rồi tưởng bề mặt thiếu. */}
        <p className="steerhint">{GIAI_THICH.caiDatKhongCoKhoa}</p>
      </div>
    </section>
  );
}

/**
 * `ready` mà mọi trường đều rỗng là ca thật: `meta/run.json` có thể tồn tại với
 * phần lớn trường rỗng.
 *
 * KHÔNG kiểm `advance_permit_chapter` ở đây — `0` của nó là dữ liệu, nhưng một tệp
 * chỉ có đúng số 0 đó thì vẫn là một tệp không nói được gì cho người vận hành.
 */
function trongRong(du: SettingsDoc): boolean {
  return (
    !du.started_at &&
    !du.provider &&
    !du.model &&
    !du.style &&
    !du.planning_tier &&
    !du.advance_mode &&
    !du.advance_hold &&
    !du.pending_steer &&
    !du.start_prompt &&
    !du.plan_start
  );
}

/** Dòng mô tả: model, chế độ đi tiếp, và mốc khởi động — ba điều đáng biết trước khi cuộn. */
function motTa(du: SettingsDoc): string | undefined {
  if (du.state === 'no_file') return undefined;
  const phan: string[] = [];
  if (du.model) phan.push(du.model);
  const cd = nhanCheDoTien(du.advance_mode);
  if (cd) phan.push(cd);
  const t = ngayGio(du.started_at);
  if (t) phan.push(CHU.khoiDongLuc(t));
  return phan.length > 0 ? phan.join(' · ') : undefined;
}
