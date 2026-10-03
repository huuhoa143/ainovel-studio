'use client';

import { CHU_VH } from '@/lib/chu/van-hanh';
import { so } from '@/lib/dinhdang';
import { layChiPhi } from '@/lib/api';
import { CHU, GIAI_THICH, TRANG_THAI_MAY, maVaiGoc, nhanVai } from '@/lib/nhan';
import { mayDangChay, vaiHienTai } from '@/lib/song';
import { useHoSo } from '@/lib/useHoSo';
import type { Snapshot } from '@/lib/types';

import { BieuTuong } from './BieuTuong';
import { TrangThai } from './TrangThai';

/**
 * Tổ sản xuất: bốn tác tử của engine cộng Engine, và những gì store ghi về từng
 * vai.
 *
 * # Điểm dễ nói dối nhất của bề mặt này: HAI CỬA SỔ khác nhau
 *
 * Hai con số trong cùng một hàng không cùng phạm vi:
 *
 *   • chương tham gia — suy từ `chapters[].owner`, phủ MỌI chương có dấu vết
 *     sản xuất
 *   • phán quyết      — đếm trong `snapshot.decisions`, và đó chỉ là 20 phán
 *     quyết gần nhất (snapshot.go:393 `const recent = 20`)
 *
 * Gọi cả hai là "tổng" thì số quyết định đứng yên ở 20 khi tác phẩm chạy tới
 * chương thứ ba trăm, và người vận hành kết luận Arbiter đã ngừng làm việc. Nên
 * cửa sổ được viết thành chữ ngay dưới lưới thẻ: một con số mà phải hover mới
 * biết phạm vi thì phần lớn người đọc sẽ không biết.
 *
 * # Vì sao thẻ không có chi phí
 *
 * `domain.UsageState` CÓ cộng chi phí theo tác tử và theo model, nhưng API chưa
 * trả phần đó ở snapshot — nó nằm ở màn Chi phí. Thẻ nói ra điều đó thay vì im lặng.
 *
 * # Vì sao liệt kê cả vai chưa chạy lượt nào
 *
 * "Editor chưa duyệt chương nào" là tin vận hành, và nó chỉ đọc được nếu Editor
 * có thẻ. Một lưới chỉ chứa vai đã chạy thì vai vắng mặt trở thành
 * vô hình, mà vai vắng mặt đúng là thứ đáng nghi nhất.
 */

/** Roster của engine, theo PRODUCT.md. Vai lạ trong dữ liệu được thêm vào sau. */
const ROSTER = ['architect', 'writer', 'editor', 'arbiter', 'engine'] as const;

interface DongVai {
  ma: string;
  /** Số chương mà vai này tham gia chu kỳ gần nhất. */
  chuong: number;
  phanQuyet: number;
  thatBai: number;
  /** Token đầu vào + đầu ra mà vai này đã dùng (usage.json) — 0 khi chưa có số liệu. */
  token: number;
  model: string[];
}

export function ToSanXuat({ snapshot, tacPham }: { snapshot: Snapshot; tacPham?: string }) {
  const quyetDinh = snapshot.decisions ?? [];
  // Token theo vai — cùng nguồn với màn Chi phí. Chương có chủ và quyết định chỉ đo được MỘT
  // phần công việc: Kiến trúc sư dựng nền tiêu cả nửa triệu token mà không sở hữu chương nào,
  // và màn này từng ghi nó "Chưa làm việc" ngay cạnh dòng "Model lượt trước: Kiến trúc sư".
  const chiPhi = useHoSo(tacPham, layChiPhi).du;
  const tokenVai = new Map<string, number>();
  for (const [ma, t] of Object.entries(chiPhi?.per_agent ?? {})) {
    const goc = maVaiGoc(ma);
    tokenVai.set(goc, (tokenVai.get(goc) ?? 0) + t.input + t.output);
  }
  const dong = xepVai(snapshot, tokenVai);

  // Không một chương nào có `owner` nghĩa là store chưa ghi checkpoint — KHÁC
  // với "mọi vai đều tham gia 0 chương". Ca đầu là không đo được, ca sau là một
  // phép đo cho kết quả 0, và chỉ ca sau mới được in ra số.
  const doDuocVai = snapshot.chapters.some((r) => r.owner && r.owner.length > 0);

  // Vai đang làm: CÙNG phép chọn với thẻ "đang làm" và thanh dưới (`vaiHienTai`). `transport.agent`
  // là vai của checkpoint gần nhất — đo được còn ghi `writer` suốt lượt Biên tập viên sửa chương.
  const vaiDang = mayDangChay(snapshot) ? vaiHienTai(snapshot, undefined) : undefined;
  const dangChay = vaiDang ? maVaiGoc(vaiDang) : undefined;

  return (
    <main className="canvas khuto vhMan" id="to-san-xuat">
      <div className="head">
        <h1>{CHU.toSanXuat}</h1>
        <span className="sub">{motTa(dong, quyetDinh.length)}</span>
      </div>

      <div className="vh">
        {dong.length === 0 ? (
          <div className="the vhTrong">
            <p className="trongSect">{GIAI_THICH.toChuaCoVaiNao}</p>
            <p className="steerhint">{GIAI_THICH.toKhongCoChiPhiTheoVai}</p>
          </div>
        ) : (
          <>
            <ul className="vhVaiLuoi" aria-label={CHU.vaiTrongTo}>
              {dong.map((v) => (
                <TheVai
                  key={v.ma}
                  v={v}
                  dangLam={dangChay === v.ma}
                  doDuocVai={doDuocVai}
                  modelGanNhat={
                    snapshot.transport.agent === v.ma ? snapshot.transport.model : undefined
                  }
                />
              ))}
            </ul>

            {/* Cửa sổ của mỗi con số viết thành chữ ngay dưới lưới, không giấu sau hover:
                số quyết định chỉ đếm trong N quyết định gần nhất, và gọi nó là "tổng" thì
                người vận hành kết luận Điều phối đã ngừng làm việc. */}
            <div className="vhChu">
              <p className="steerhint">{CHU_VH.cuaSoNhom(quyetDinh.length)}</p>
              {!doDuocVai ? <p className="steerhint">{GIAI_THICH.toKhongDoDuocVai}</p> : null}
              <p className="steerhint">{GIAI_THICH.toKhongCoChiPhiTheoVai}</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/** Biểu tượng của từng vai; vai lạ dùng biểu tượng chung của nhóm. */
const BIEU_TUONG_VAI: Record<string, string> = {
  architect: 'danY',
  writer: 'vanPhong',
  editor: 'nhanXet',
  arbiter: 'nhatKy',
  engine: 'phien',
};

/**
 * Thẻ một vai: biểu tượng, tên Việt, việc của vai, model, rồi ba con số.
 *
 * Model ưu tiên `transport.model` khi vai này là vai chạy lượt gần nhất — đó là model THẬT
 * vừa được gọi. Không có thì lấy các model ghi trong quyết định, và nhãn nói rõ nguồn nào.
 */
function TheVai({
  v,
  dangLam,
  doDuocVai,
  modelGanNhat,
}: {
  v: DongVai;
  dangLam: boolean;
  doDuocVai: boolean;
  modelGanNhat: string | undefined;
}) {
  const daLam = v.chuong > 0 || v.phanQuyet > 0 || v.token > 0;
  const model = modelGanNhat ? [modelGanNhat] : v.model;
  const giai = CHU_VH.giaiVai[v.ma];

  return (
    <li className="the vhVai" data-lam={dangLam ? 'dang' : daLam ? 'co' : 'chua'}>
      <div className="vhVaiDau">
        <span className="vhVaiBt" aria-hidden="true">
          <BieuTuong ten={BIEU_TUONG_VAI[v.ma] ?? 'nhomAi'} co={17} />
        </span>
        <div className="vhVaiTen">
          <h2>{nhanVai(v.ma)}</h2>
          {giai ? <p>{giai}</p> : null}
        </div>
        {/* `dap` đúng ở đây: nhãn chỉ vẽ khi `transport.state === 'running'` — chính sự thật
            liveness, không phải một công đoạn đã ghi vào store. */}
        {dangLam ? (
          <TrangThai tt={TRANG_THAI_MAY.running} dap />
        ) : (
          // Cả hai ca đều có nhãn: bản trước chỉ vai CHƯA làm mới có, nên thẻ đã làm trông như
          // thiếu một mảnh.
          <span className={`vien${daLam ? ' teal' : ''}`}>{daLam ? CHU_VH.daLam : CHU_VH.chuaLam}</span>
        )}
      </div>

      <div className="vhVaiModel">
        <span className="vhVaiModelNhan">
          {modelGanNhat ? CHU_VH.modelGanNhat : CHU_VH.modelDaGhi}
        </span>
        {model.length > 0 ? (
          model.map((m) => (
            <span className="ma" key={m}>
              {m}
            </span>
          ))
        ) : (
          <span className="trong">{CHU_VH.chuaGhiModel}</span>
        )}
      </div>

      <dl className="vhVaiSo">
        <div>
          <dt>{CHU_VH.chuongDaLam}</dt>
          {/* Không một chương nào có `owner` nghĩa là KHÔNG ĐO ĐƯỢC, khác với đo ra 0. */}
          <dd>
            {doDuocVai ? (
              so(v.chuong)
            ) : (
              <span className="trong" title={GIAI_THICH.toKhongDoDuocVai}>
                {CHU.khongCo}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>{CHU_VH.quyetDinh}</dt>
          <dd>{so(v.phanQuyet)}</dd>
        </div>
        <div data-loi={v.thatBai > 0 || undefined}>
          <dt>{CHU_VH.loi}</dt>
          <dd>{so(v.thatBai)}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * Gộp roster với các vai thật sự thấy trong dữ liệu.
 *
 * Vai lạ (chuỗi ngoài roster) được thêm vào cuối chứ không bỏ đi: `owner` và
 * `decider` là chuỗi tự do ở tầng dữ liệu, và bỏ một vai lạ nghĩa là công của
 * nó biến mất khỏi bảng mà không ai biết.
 */
function xepVai(snapshot: Snapshot, tokenVai: Map<string, number> = new Map()): DongVai[] {
  const quyetDinh = snapshot.decisions ?? [];

  const chuong = new Map<string, number>();
  for (const r of snapshot.chapters) {
    for (const o of r.owner ?? []) {
      chuong.set(o, (chuong.get(o) ?? 0) + 1);
    }
  }

  const phanQuyet = new Map<string, number>();
  const thatBai = new Map<string, number>();
  const model = new Map<string, Set<string>>();
  for (const d of quyetDinh) {
    if (!d.decider) continue;
    phanQuyet.set(d.decider, (phanQuyet.get(d.decider) ?? 0) + 1);
    if (d.error) thatBai.set(d.decider, (thatBai.get(d.decider) ?? 0) + 1);
    if (d.model) {
      const co = model.get(d.decider) ?? new Set<string>();
      co.add(d.model);
      model.set(d.decider, co);
    }
  }

  const la = [...new Set([...chuong.keys(), ...phanQuyet.keys(), ...tokenVai.keys()])]
    .filter((m) => !(ROSTER as readonly string[]).includes(m))
    .sort();

  return [...ROSTER, ...la].map((ma) => ({
    ma,
    chuong: chuong.get(ma) ?? 0,
    phanQuyet: phanQuyet.get(ma) ?? 0,
    thatBai: thatBai.get(ma) ?? 0,
    token: tokenVai.get(ma) ?? 0,
    model: [...(model.get(ma) ?? [])].sort(),
  }));
}

/** Chỉ nói điều đếm được, và nói kèm cửa sổ của nó. */
function motTa(dong: DongVai[], soQuyetDinh: number): string {
  const daChay = dong.filter((v) => v.chuong > 0 || v.phanQuyet > 0 || v.token > 0).length;
  return `${dong.length} vai · ${daChay} đã làm việc · ${CHU.demPhanQuyetDaTai(soQuyetDinh)}`;
}
