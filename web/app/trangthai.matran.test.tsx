import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { BuongLai } from '@/components/BuongLai';
import { DieuKhien } from '@/components/DieuKhien';
import { Transport } from '@/components/Transport';
import { snap, sach } from '@/components/mau.test-helper';
import { viSaoDung } from '@/lib/loiLlm';
import { trangThaiCua } from '@/lib/nghiemThu';
import { nhanVai } from '@/lib/nhan';
import { mayDangChay } from '@/lib/song';
import type { Snapshot, Stage, Vai } from '@/lib/types';
import { BO_DEM_RONG, moLuot, themChu, type BoDemVan } from '@/lib/vanSong';

/**
 * MA TRẬN TRẠNG THÁI — mọi bề mặt của màn Tiến độ phải nói CÙNG một điều về cùng một engine.
 *
 * Mỗi bài kiểm khác trong repo canh MỘT bề mặt. Chúng xanh cả trong khi trên truyện thật, cùng
 * một khung hình, thẻ ghi "Kiến trúc sư đang làm" còn thanh dưới ghi "Điều phối"; dải duyệt ghi
 * "Chương 1 đang chờ" còn thẻ ghi "Chương 2"; thanh dưới ghi "vừa xong" cho một bước đang chạy;
 * và sau khi khởi động lại studio, "Đang viết · đã chạy 10 phút" đứng cạnh nút "Viết tiếp".
 * Không bài đơn lẻ nào bắt được những lỗi ấy, vì lỗi không nằm TRONG bề mặt nào — nó nằm GIỮA
 * chúng. Tệp này dựng cả màn đúng như `app/page.tsx` nối dây (thẻ + dải duyệt + khu văn + thanh
 * dưới + bộ nút, `dangChay` suy bằng chính `mayDangChay`) rồi kiểm các BẤT BIẾN chéo ở từng
 * trạng thái engine có thật.
 */

const FETCH = vi.fn(() => new Promise<never>(() => {}));
beforeEach(() => vi.stubGlobal('fetch', FETCH));
afterEach(() => cleanup());

const VIET: Vai = {
  role: 'writer',
  state: 'working',
  tool: 'draft_chapter',
  task: 'writer → draft_chapter(chương 2)',
  depth: 0,
};
const DOC_TAI_LIEU: Vai = {
  role: 'writer',
  state: 'working',
  tool: 'novel_context',
  task: 'writer → novel_context(chương 2)',
  depth: 0,
};
const KIEN_TRUC: Vai = {
  role: 'architect_short',
  state: 'working',
  tool: 'novel_context',
  task: 'architect_short → novel_context',
  depth: 0,
};
const AUTO = { mode: 'auto', hold: false };
const DUYET = { mode: 'review', hold: false };

const chuong = (n: number, stage: Stage, title = `Tên ${n}`): Snapshot['chapters'][number] => ({
  chapter: n,
  title,
  stage,
});

interface Ca {
  ten: string;
  s: Partial<Snapshot>;
  /** Các lượt văn sống đúng dạng engine phát (lượt công cụ mở bằng "✻ "). */
  van?: string[];
}

function boDem(luot: string[] = []): BoDemVan {
  return luot.reduce((bd, chu) => themChu(moLuot(bd, 'vạch'), chu), BO_DEM_RONG);
}

const CA: Ca[] = [
  {
    ten: 'phiên đóng, truyện dở',
    s: {
      runtime: '',
      advance: null,
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0 },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'phiên đóng, chương viết dở từ lâu',
    s: {
      runtime: '',
      advance: null,
      book: sach({ completed_chapters: 725, total_chapters: 783, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0 },
      in_progress_chapter: 726,
      chapters: [chuong(726, 'drafting'), chuong(725, 'done')],
      timeline: {
        volumes: null,
        arcs: null,
        chapters: [
          { chapter: 725, state: 'done' },
          { chapter: 726, state: 'running' },
          { chapter: 727, state: 'pending' },
        ],
      },
    },
  },
  {
    ten: 'phiên mở, nghỉ, tự chạy',
    s: {
      runtime: 'idle',
      advance: AUTO,
      agents: [],
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'idle', engine_open: true }),
      transport: { state: 'idle', cost_usd: 0 },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'đang dựng nền',
    // Tiêu đề dự phòng của engine là tên hàm trần — phải được dịch trước khi lên màn.
    van: ['✻ audit_foundation\n', '✻ Đọc tài liệu truyện\nchapter: 1'],
    s: {
      runtime: 'running',
      advance: AUTO,
      agents: [KIEN_TRUC],
      book: sach({ completed_chapters: 0, total_chapters: 2, phase: 'premise', activity: 'running' }),
      transport: { state: 'running', cost_usd: 0 },
    },
  },
  {
    ten: 'đang viết nháp chương 2',
    van: ['✻ Lên kế hoạch chương\n  characters:\n    - An', 'An đẩy cửa bước ra bến.'],
    s: {
      runtime: 'running',
      advance: AUTO,
      agents: [VIET],
      in_progress_chapter: 2,
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'running' }),
      transport: { state: 'running', cost_usd: 0, last_step: 'plan' },
      chapters: [chuong(2, 'drafting'), chuong(1, 'done')],
    },
  },
  {
    ten: 'đang đọc tài liệu cho chương 2 (sự kiện chỉ có bước đã xong)',
    s: {
      runtime: 'running',
      advance: DUYET,
      agents: [DOC_TAI_LIEU],
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'running' }),
      transport: {
        state: 'running',
        cost_usd: 0,
        last_step: 'commit',
        last_call: { agent: 'arbiter', provider: 'p', model: 'm', at: '' },
      },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'chế độ duyệt, bạn tự dừng giữa chương 2 (không phải cửa)',
    s: {
      runtime: 'paused',
      advance: DUYET,
      agents: [],
      stop: { at: '', kind: 'user', reason: 'Người dùng tạm dừng' },
      book: sach({ completed_chapters: 1, total_chapters: 3, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0, last_step: 'plan' },
      chapters: [chuong(2, 'drafting'), chuong(1, 'done')],
    },
  },
  {
    ten: 'engine tự dừng vì hết tuyến model',
    s: {
      runtime: 'paused',
      advance: AUTO,
      agents: [],
      stop: {
        at: '',
        kind: 'stuck',
        reason: 'Phán quyết bế tắc',
        last_error: 'routing_exhausted: All models exhausted: 9 routes checked (9 prompt too large for the model). [rate_limit, HTTP 429]',
        last_error_agent: 'writer',
      },
      book: sach({ completed_chapters: 1, total_chapters: 3, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0, last_step: 'plan' },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'Biên tập viên sửa lại chương 1 đã xong (chương kế tiếp là 2)',
    s: {
      runtime: 'running',
      advance: DUYET,
      agents: [
        { role: 'editor', state: 'working', tool: 'read_chapter', chapter: 1, task: 'editor → read_chapter(chương 1)', depth: 0 },
      ],
      book: sach({ completed_chapters: 1, total_chapters: 3, activity: 'running' }),
      transport: { state: 'running', cost_usd: 0, last_step: 'commit' },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'cửa duyệt dàn ý (chưa có chương nào)',
    s: {
      runtime: 'paused',
      advance: DUYET,
      agents: [],
      book: sach({ completed_chapters: 0, total_chapters: 2, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0 },
      chapters: [chuong(1, 'pending')],
    },
  },
  {
    ten: 'cửa duyệt sau chương 1',
    s: {
      runtime: 'paused',
      advance: DUYET,
      agents: [],
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'idle' }),
      transport: { state: 'idle', cost_usd: 0, last_step: 'commit' },
      chapters: [chuong(2, 'pending'), chuong(1, 'done')],
    },
  },
  {
    ten: 'đang dừng (pausing)',
    s: {
      runtime: 'pausing',
      advance: AUTO,
      agents: [VIET],
      book: sach({ completed_chapters: 1, total_chapters: 2, activity: 'running' }),
      transport: { state: 'running', cost_usd: 0 },
      chapters: [chuong(2, 'drafting'), chuong(1, 'done')],
    },
  },
  {
    ten: 'truyện đã xong',
    s: {
      runtime: 'completed',
      advance: AUTO,
      agents: [],
      book: sach({ completed_chapters: 2, total_chapters: 2, phase: 'complete', activity: 'complete' }),
      transport: { state: 'complete', cost_usd: 0 },
      chapters: [chuong(2, 'done'), chuong(1, 'done')],
    },
  },
  {
    ten: 'truyện đã xong, phiên đóng',
    s: {
      runtime: '',
      advance: null,
      book: sach({ completed_chapters: 2, total_chapters: 2, phase: 'complete', activity: 'complete' }),
      transport: { state: 'complete', cost_usd: 0 },
      chapters: [chuong(2, 'done'), chuong(1, 'done')],
    },
  },
];

/** Dựng cả màn y như `app/page.tsx`: cùng props, cùng phép suy `dangChay`. */
function veMan(s: Snapshot, van?: string[]) {
  const dangChay = mayDangChay(s);
  const r = render(
    <div>
      <BuongLai
        snapshot={s}
        tacPham="b"
        vuaChot={new Set<number>()}
        chuongChon={undefined}
        onChonChuong={() => {}}
        onChonKhu={() => {}}
        onDocChuong={() => {}}
        onDoi={() => {}}
        suKien={[]}
        song={undefined}
        vanSong={boDem(van)}
        dangChay={dangChay}
      />
      <Transport
        transport={s.transport}
        song={undefined}
        suKien={[]}
        runtime={s.runtime}
        hoatDong={s.book.activity}
        agents={s.agents}
        dungVi={viSaoDung(s)}
      >
        <DieuKhien snapshot={s} tacPham="b" dangChay={dangChay} onDoi={() => {}} />
      </Transport>
    </div>,
  );
  const q = (sel: string) => r.container.querySelector(sel);
  const chu = (sel: string) => q(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const nutBar = [...r.container.querySelectorAll('footer.trans button')].map(
    (b) => b.textContent?.trim() ?? '',
  );
  const nutCua = [...r.container.querySelectorAll('.cuanghiemthu .cntnut button')].map(
    (b) => b.textContent?.trim() ?? '',
  );
  return { r, q, chu, nutBar, nutCua, dangChay };
}

const soChuong = (s: string) => /Chương (\d+)/.exec(s)?.[1];

describe.each(CA)('$ten', ({ s: p, van }) => {
  const s = snap(p);
  const cua = trangThaiCua(s.advance, s.runtime, s.stop);

  test('máy chạy hay không: thẻ, thanh dưới, nhịp đập và bộ nút nói cùng một điều', () => {
    const { r, q, chu, nutBar, dangChay } = veMan(s, van);
    const tt = chu('.tdDangLam .tdTt');
    const coDung = nutBar.some((n) => n.includes('Tạm dừng'));
    const coChay = nutBar.some((n) => /^▶/.test(n));

    expect(!!q('footer.trans[data-chay]'), 'đường chạy trên thanh dưới').toBe(dangChay);
    expect(coDung, `nút Tạm dừng — nút: ${nutBar.join(' | ')}`).toBe(dangChay);
    if (dangChay) {
      expect(tt, 'thẻ nói đang viết').toMatch(/Đang viết|Đang kẹt/);
      expect(coChay, 'đang chạy mà còn mời bấm chạy').toBe(false);
      expect(q('.tdDangLam .tdDot.dap'), 'chấm đập của thẻ').not.toBeNull();
    } else {
      expect(tt, 'máy không chạy mà thẻ ghi đang viết').not.toMatch(/Đang viết/);
      // "đang viết" là khẳng định về MÁY: không chạy thì không chỗ nào được nói thế — kể cả
      // bảng chương và trục, nơi `stage: drafting` trên đĩa từng hiện thành "▸ đang viết".
      expect(r.container.textContent ?? '', 'nói "đang viết" khi máy không chạy').not.toMatch(
        /đang viết/i,
      );
      // Không chạy thì KHÔNG có gì động: chấm đập, dải quét, vòng quay, con trỏ.
      expect(q('.dap'), 'phần tử còn đập khi máy không chạy').toBeNull();
      expect(q('.buocCc.dang, .conTro'), 'vòng quay / con trỏ khi máy không chạy').toBeNull();
    }
  });

  test('cửa duyệt: dải, thẻ và thanh dưới cùng nói một chương, một nút duyệt', () => {
    const { q, chu, nutBar, nutCua } = veMan(s, van);
    expect(!!q('.cuanghiemthu'), 'dải duyệt').toBe(cua.dangCho);
    const duyetBar = nutBar.filter((n) => n.startsWith('Duyệt'));
    if (!cua.dangCho) {
      expect(duyetBar, 'nút duyệt khi không có gì chờ duyệt').toEqual([]);
      return;
    }
    // Đúng MỘT nút duyệt ở thanh dưới, chiếm ô chính — không đứng cạnh "Viết tiếp".
    expect(duyetBar).toHaveLength(1);
    expect(nutBar.some((n) => /^▶/.test(n)), 'nút chạy đứng cạnh nút duyệt').toBe(false);
    // Dải và thanh dưới cùng một nhãn duyệt.
    expect(nutCua[0]).toBe(duyetBar[0]);
    expect(chu('.tdDangLam .tdTt')).toContain('Chờ bạn duyệt');
    // Thanh dưới gọi đúng tên trạng thái ấy, không phải "tạm dừng" trơn.
    expect(chu('footer.trans .cell.ghim'), 'thanh dưới ở cửa duyệt').toContain('chờ duyệt');
    if (s.book.completed_chapters === 0) {
      expect(chu('.cuanghiemthu'), 'cửa dàn ý mà nói "chương này"').not.toMatch(/chương này/);
      expect(duyetBar[0]).toContain('chương 1');
    } else {
      const trongDai = soChuong(chu('.cuanghiemthu .cnthead'));
      const trongThe = soChuong(chu('.tdDangLam .tdChuong'));
      expect(trongDai, 'dải duyệt nêu chương').toBeDefined();
      expect(trongThe, 'thẻ và dải nói hai chương khác nhau').toBe(trongDai);
      expect(duyetBar[0]).toContain(`chương ${s.book.completed_chapters + 1}`);
      expect(nutCua.join(' ')).toContain(`chương ${trongDai}`);
    }
  });

  test('vai và bước đang làm: thẻ và thanh dưới không nói hai vai, hai thì', () => {
    const { chu, dangChay } = veMan(s, van);
    const goc = s.agents?.find((a) => a.depth === 0 && a.state !== 'idle');
    if (!dangChay || !goc) return;
    const vai = nhanVai(goc.role);
    expect(chu('footer.trans .cell.to'), 'vai ở thanh dưới').toContain(vai);
    expect(chu('.tdDangLam .daitrangthai'), 'vai ở thẻ').toContain(vai);
    // Cây vai nói vai ấy ĐANG chạy một công cụ, nên thanh dưới không được ghi "vừa xong".
    if (goc.tool) expect(chu('footer.trans .cell.buoc')).not.toMatch(/vừa xong/);
    // Thẻ cũng không được kể bước đã xong của chương TRƯỚC như việc đang diễn ra.
    expect(chu('.tdDangLam .tdMoTa')).not.toMatch(/vừa chốt/);
  });

  test('truyện xong: chỉ còn Viết thêm, không còn nút mở sẵn hay duyệt', () => {
    const { nutBar } = veMan(s, van);
    if (s.book.phase !== 'complete') return;
    expect(nutBar.some((n) => n.includes('Viết thêm'))).toBe(true);
    expect(nutBar.some((n) => /Mở sẵn|Duyệt|Tạm dừng/.test(n)), nutBar.join(' | ')).toBe(false);
    // Công tắc chế độ đi tiếp không còn nghĩa gì trên truyện đã xong.
    expect(nutBar.some((n) => /^(Liên tục|Từng chương)$/.test(n)), nutBar.join(' | ')).toBe(false);
  });

  test('không lộ chữ máy: undefined, NaN, tên hàm thô', () => {
    const { r } = veMan(s, van);
    const t = r.container.textContent ?? '';
    expect(t).not.toMatch(/undefined|NaN|\[object/);
    expect(t, 'tên hàm engine lọt ra màn hình').not.toMatch(
      /(novel_context|draft_chapter|plan_chapter|commit_chapter|save_foundation|audit_foundation|architect_short)/,
    );
  });
});

describe('ca riêng của lần dừng và lượt sửa', () => {
  const ca = (ten: string) => snap(CA.find((c) => c.ten.startsWith(ten))!.s);

  test('tự dừng giữa chương ở chế độ duyệt: không mời duyệt, thanh dưới nói tạm dừng', () => {
    const { q, chu, nutBar } = veMan(ca('chế độ duyệt, bạn tự dừng'));
    expect(q('.cuanghiemthu')).toBeNull();
    expect(nutBar.some((n) => n.startsWith('Duyệt')), nutBar.join(' | ')).toBe(false);
    expect(chu('footer.trans .cell.ghim')).toContain('tạm dừng');
  });

  test('engine tự dừng: thẻ, gợi ý và thanh dưới cùng nói "tự dừng" và lỗi gốc', () => {
    const { chu } = veMan(ca('engine tự dừng'));
    expect(chu('.tdDangLam .tdTt')).toContain('Đã tự dừng');
    expect(chu('.tdDangLam')).toMatch(/không chứa nổi độ dài yêu cầu/);
    expect(chu('footer.trans .cell.ghim')).toContain('đã tự dừng');
  });

  test('đang sửa lại chương 1: thẻ nói chương 1, không vẽ dải bước của chương mới', () => {
    const { q, chu } = veMan(ca('Biên tập viên sửa lại'));
    expect(chu('.tdDangLam .tdChuong')).toMatch(/Chương 1\b/);
    expect(q('.tdDangLam .tdBuoc')).toBeNull();
    expect(chu('.tdDangLam .tdMoTa')).not.toMatch(/vừa chốt|kế hoạch chương/);
  });
});
