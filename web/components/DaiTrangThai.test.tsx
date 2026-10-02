import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CHU, GIAI_THICH } from '@/lib/nhan';

import { DaiTrangThai } from './DaiTrangThai';
import { snap } from './mau.test-helper';

test('vẽ cây vai với công cụ và số lượt', () => {
  render(
    <DaiTrangThai
      snapshot={snap({
        agents: [
          { role: 'writer', state: 'working', tool: 'draft_chapter', turn: 7, depth: 0 },
          { role: 'novel_context', state: 'working', depth: 1 },
        ],
        idle_agents: ['architect_long', 'editor'],
      })}
    />,
  );

  // `Writer` chứ không phải `writer`: tên bốn tác tử của PRODUCT.md đi qua `nhanVai` như mọi
  // chỗ khác trên trang — xem "chỗ kế hoạch sai" trong nhật ký thi hành.
  expect(screen.getByText(/Người viết/)).toBeDefined();
  // Tên công cụ đi qua cùng bảng dịch với Diễn biến; nguyên văn ở `title`.
  expect(screen.getByText(/Viết nháp chương/)).toBeDefined();
  expect(screen.getByTitle('draft_chapter')).toBeDefined();
  expect(screen.getByText(/7/)).toBeDefined();
  // Vai RẢNH không còn được in thành "chờ: …" — ở chặng viết, Kiến trúc sư rảnh vì đã xong
  // việc, và "chờ: Kiến trúc sư" dưới Người viết đọc như Người viết đang đợi.
  expect(screen.queryByText(/Kiến trúc sư/)).toBeNull();
  expect(screen.queryByText(/architect_long/)).toBeNull();
});

test('việc giao nội bộ "engine → architect_short (…)" đọc thành câu, nguyên văn ở title', () => {
  const tho = 'engine → architect_short (Hãy xây dựng một truyện ngắn g...)';
  render(
    <DaiTrangThai
      snapshot={snap({
        agents: [{ role: 'architect_short', state: 'working', task: tho, depth: 0 }],
        idle_agents: [],
      })}
    />,
  );
  const viec = screen.getByText('Điều phối giao việc cho Kiến trúc sư');
  expect(viec.getAttribute('title')).toBe(tho);
  expect(screen.getByText('Kiến trúc sư')).toBeDefined();
});

test('ngữ cảnh null hiện dấu KHÔNG ĐO ĐƯỢC, không phải thước 0%', () => {
  // Lớp lỗi đã đo ở dự án này: `null` bị đọc thành `0` và giao diện vẽ một thước 0% cho một
  // thứ không có nguồn. Hai điều đó nói hai chuyện khác nhau.
  //
  // Hỏi TRONG ô ngữ cảnh chứ không hỏi cả dải: fixture để mặc định mọi trường sống là `null`
  // (engine đóng), nên câu "không đo được" xuất hiện ở nhiều ô. Một `getByText` toàn dải sẽ
  // đỏ vì "Found multiple elements" — đỏ vì một lý do không liên quan tới điều đang canh.
  const { container } = render(<DaiTrangThai snapshot={snap({ context: null })} />);
  const o = container.querySelector('.dtngucanh');

  expect(o).not.toBeNull();
  expect(container.querySelector('.thuoc')).toBeNull();
  expect(o!.textContent).toContain(CHU.khongDoDuoc);
});

test('ngữ cảnh đo được BẰNG 0 vẫn vẽ thước, kèm con số có nguồn', () => {
  const { container } = render(
    <DaiTrangThai snapshot={snap({ context: { tokens: 0, window: 128000, percent: 0 } })} />,
  );
  expect(container.querySelector('.thuoc')).not.toBeNull();
  // Con số đi cùng thước, không chỉ mình phần trăm: một cây thước không có mẫu số thì không
  // đối chiếu được với gì. Bỏ hẳn cặp token vẫn xanh nếu bài này chỉ hỏi `.thuoc` (đã thử
  // đột biến).
  expect(container.querySelector('.dtso')!.textContent).toContain('0/128.000');
});

test('không có vai nào thì nói ra, không để dải trống', () => {
  const { container } = render(
    <DaiTrangThai snapshot={snap({ agents: [], idle_agents: [] })} />,
  );
  const o = container.querySelector('.dtvai');

  expect(o).not.toBeNull();
  expect(o!.textContent).toContain(GIAI_THICH.chuaCoVaiNaoChay);
  // Và KHÔNG được nói "không đo được": `[]` là một phép đo đã thực hiện. Kế hoạch cho bài này
  // một biểu thức `/không đo được|chưa có vai/i` — nó nhận cả hai câu, tức nó xanh kể cả khi
  // giao diện gộp hai ca lại, đúng thứ cả cụm này tồn tại để chặn.
  expect(o!.textContent).not.toContain(CHU.khongDoDuoc);
});

test('vai lồng nằm TRONG vai cha ở DOM, không phải một hàng ngang', () => {
  // Bài "vẽ cây vai" của kế hoạch không canh được điều tên nó nói: thay `cayVai` bằng một
  // `map` phẳng vẫn xanh (đã thử đột biến), vì bốn khẳng định của nó chỉ hỏi "chữ này có xuất
  // hiện đâu đó không".
  //
  // Bậc lồng là CẤU TRÚC, không phải thụt lề: `novel_context` chạy dưới `writer` là một quan
  // hệ, và trình đọc màn hình chỉ đọc được nó nếu DOM có nó. Vẽ hai vai thành hai hàng ngang
  // là nói rằng engine đang chạy hai việc song song — một câu khác hẳn.
  const { container } = render(
    <DaiTrangThai
      snapshot={snap({
        agents: [
          { role: 'writer', state: 'working', tool: 'draft_chapter', turn: 7, depth: 0 },
          { role: 'novel_context', state: 'working', depth: 1 },
        ],
        idle_agents: [],
      })}
    />,
  );

  expect(container.querySelectorAll('.cayvai > li')).toHaveLength(1);
  const con = container.querySelectorAll('.cayvai li li');
  expect(con).toHaveLength(1);
  expect(con[0]!.textContent).toContain('novel_context');
});

test('vai null nói KHÔNG ĐO ĐƯỢC; vai [] nói chưa có vai — hai câu khác nhau', () => {
  // Không bài nào của kế hoạch chạm tới nhánh `agents === null`: gộp nó vào nhánh rỗng vẫn
  // xanh cả bộ (đã thử đột biến). Mà đó đúng là cặp ca mà cả cụm này tồn tại để tách —
  // "engine đóng nên không biết" và "engine mở, không ai chạy" là hai tin vận hành khác nhau.
  //
  // `idle_agents: []` ở CẢ HAI lần vẽ là điều kiện để bài này đo đúng cái nó nói: dòng "chờ"
  // nằm trong cùng ô `.dtvai` và cũng biết nói "không đo được", nên để nó ở `null` là mở
  // đường cho khẳng định dưới đây xanh nhờ dòng chờ chứ không nhờ nhánh vai.
  const { container, rerender } = render(
    <DaiTrangThai snapshot={snap({ agents: null, idle_agents: [] })} />,
  );
  const o = () => container.querySelector('.dtvai')!;

  expect(o().textContent).toContain(CHU.khongDoDuoc);
  expect(o().textContent).not.toContain(GIAI_THICH.chuaCoVaiNaoChay);
  // Dấu đó phải mang theo lời giải thích: chỉ ba chữ "không đo được" thì người vận hành không
  // biết đó là engine đóng hay studio hỏng.
  expect(o().querySelector('.khongdo')!.getAttribute('title')).toBe(
    GIAI_THICH.truongSongNull,
  );

  rerender(<DaiTrangThai snapshot={snap({ agents: [], idle_agents: [] })} />);

  expect(o().textContent).toContain(GIAI_THICH.chuaCoVaiNaoChay);
  expect(o().textContent).not.toContain(CHU.khongDoDuoc);
});

test('không còn dòng "chờ: …" dù engine có báo vai rảnh hay không', () => {
  // `idle_agents` là các vai đã xong việc hoặc chưa tới lượt — in chúng thành "chờ" là nói sai
  // quan hệ giữa các vai. Cả ba ca (null, [], có tên) đều không vẽ dòng nào.
  for (const idle of [null, [], ['architect_short']] as const) {
    const { container, unmount } = render(
      <DaiTrangThai snapshot={snap({ agents: [], idle_agents: idle as string[] | null })} />,
    );
    expect(container.querySelector('.dtcho')).toBeNull();
    unmount();
  }
});

test('lượt 0 vẫn hiện — đó là lượt đầu tiên, không phải vắng', () => {
  // Kiểm falsy thay vì `!== undefined` làm `turn: 0` biến mất, và bộ kiểm không thấy vì bài
  // duy nhất có `turn` dùng số 7 (đã thử đột biến). Lượt 0 là tin thật: vai vừa được gọi,
  // chưa đi lượt nào — đúng lúc người dùng cần phân biệt "vừa bắt đầu" với "treo".
  const { container } = render(
    <DaiTrangThai
      snapshot={snap({
        agents: [{ role: 'writer', state: 'working', turn: 0, depth: 0 }],
        idle_agents: [],
      })}
    />,
  );

  expect(container.querySelector('.vailuot')!.textContent).toBe(CHU.luotVai(0));
});

test('phần trăm ngoài khoảng không đẩy thước tràn ra ngoài dải, mà số vẫn nói thật', () => {
  // Kẹp 0–100 không có bài nào giữ (đã thử đột biến). Hai khẳng định ở đây phải đi CÙNG nhau:
  // kẹp là việc của hình vẽ, còn con số in ra phải giữ nguyên giá trị engine báo — kẹp cả con
  // số là giấu đi đúng cái bất thường đáng xem.
  const { container } = render(
    <DaiTrangThai
      snapshot={snap({ context: { tokens: 320000, window: 128000, percent: 250 } })}
    />,
  );

  expect(container.querySelector<HTMLElement>('.kim')!.style.width).toBe('100%');
  expect(container.querySelector('.dtso')!.textContent).toContain('250%');
});
