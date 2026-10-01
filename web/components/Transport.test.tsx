import { render } from '@testing-library/react';
import { expect, test } from 'vitest';

import { TRANG_THAI_MAY_RUNTIME } from '@/lib/nhan';

import { Transport } from './Transport';
import { snap } from './mau.test-helper';

/**
 * Thanh transport phải nói ĐÚNG MỘT câu về máy.
 *
 * # Lỗi mà tệp này ra đời để canh
 *
 * ĐO ĐƯỢC trên app thật 2026-08-02, cuốn `viet-truyen-dang-trung-sinh`. API trả
 * `runtime: "paused"` cùng lúc với `transport.state: "running"`, và thanh dưới in ra bốn
 * thứ trong vòng 200 pixel:
 *
 *   vạch đầu đọc   TẮT           ← đọc `mayChay` (runtime) → đúng
 *   ký hiệu        ▶ ĐANG ĐẬP    ← đọc `transport.state`   → sai
 *   chữ            "đang chạy"   ← đọc `transport.state`   → sai
 *   nút            "▶ Chạy"      ← đọc `mayDangChay`       → đúng
 *
 * Người vận hành đọc "đang chạy" trên một cỗ máy đang đứng im, và cạnh đó là một nút mời
 * bấm Chạy. Đó là hỏng đúng tiêu chí thành công của PRODUCT.md:27 — "trong 5 giây biết được
 * dây chuyền khỏe hay bệnh".
 *
 * Không bài kiểm nào bắt được nó suốt bốn kế hoạch, vì mọi fixture đều để `runtime` và
 * `transport.state` NÓI CÙNG MỘT ĐIỀU. Nên luật của tệp này: mỗi bài phải đặt hai trường ấy
 * LỆCH nhau, hoặc nó không kiểm được gì.
 */

const NEN = { song: undefined, suKien: [] } as const;

function ve(runtime: string, state: 'running' | 'idle' | 'complete') {
  const s = snap({ runtime, transport: { state, cost_usd: 0, last_step: 'commit' } });
  return render(
    <Transport
      transport={s.transport}
      song={NEN.song}
      suKien={[...NEN.suKien]}
      runtime={s.runtime}
      hoatDong={s.book.activity}
    />,
  );
}

test('runtime=paused THẮNG transport.state=running — thanh ghi "tạm dừng"', () => {
  const { container } = ve('paused', 'running');
  const o = container.querySelector('.trans .cell');
  expect(o?.textContent).toContain(TRANG_THAI_MAY_RUNTIME.paused.nhan);
  expect(o?.textContent).not.toContain('đang chạy');
});

test('ở paused, ký hiệu KHÔNG đập và đầu đọc KHÔNG bật', () => {
  // Hai kênh chuyển động, cùng một sự thật. Bản cũ để chúng đi hai đường: `data-chay` đọc
  // `mayChay` còn `.dap` đọc `transport.state`, nên vạch tắt trong khi ▶ đập.
  const { container } = ve('paused', 'running');
  expect(container.querySelector('.trans .ky.dap')).toBeNull();
  expect(container.querySelector('.trans')?.getAttribute('data-chay')).toBeNull();
});

test('ở running, ký hiệu ĐẬP và đầu đọc BẬT', () => {
  // Chiều dương cũng phải canh: một bản sửa tắt hẳn chuyển động sẽ làm ba bài trên xanh hết.
  const { container } = ve('running', 'idle');
  expect(container.querySelector('.trans .ky.dap')).not.toBeNull();
  expect(container.querySelector('.trans')?.getAttribute('data-chay')).toBe('1');
});

test('pausing có câu RIÊNG, không gộp vào paused hay running', () => {
  const { container } = ve('pausing', 'running');
  const chu = container.querySelector('.trans .cell')?.textContent ?? '';
  expect(chu).toContain(TRANG_THAI_MAY_RUNTIME.pausing.nhan);
  expect(container.querySelector('.trans .ky.dap')).toBeNull();
});

test('engine ĐÓNG (runtime rỗng) rơi về activity của cuốn', () => {
  // Fixture để `book.activity: 'running'`, nên ca này phải ra "đang chạy" — và đó là đúng:
  // engine đóng thì checkpoint là sự thật mạnh nhất còn lại.
  const { container } = ve('', 'running');
  expect(container.querySelector('.trans .cell')?.textContent).toContain('đang chạy');
});

test('runtime LẠ không làm trắng ô trạng thái', () => {
  // Một bản engine mới hơn web thêm trạng thái thứ sáu là ca đến được. Ô trả lời câu hỏi số
  // một mà trắng thì tệ hơn một câu trả lời kém chính xác.
  const { container } = ve('draining', 'running');
  const chu = container.querySelector('.trans .cell')?.textContent ?? '';
  expect(chu.trim().length).toBeGreaterThan(0);
  expect(chu).toContain('đang chạy');
});

/* ── hình học: cụm nút không được trôi theo dữ liệu ──────────────────────
 *
 * jsdom KHÔNG bố cục, nên ở đây không đo được pixel — vị trí thật là việc của phép kiểm
 * trên trình duyệt (đã đo: 1.222px nhảy ở bản cũ, 0px ở bản mới). Nói ra để không ai tưởng
 * bộ kiểm này canh cả toạ độ.
 *
 * Cái jsdom ĐO ĐƯỢC là CẤU TRÚC — và cấu trúc mới chính là thứ giữ toạ độ đứng yên: dải số
 * nằm trong một vùng cắt được riêng, cụm nút là anh em của vùng đó chứ không phải phần tử
 * cuối cùng của một hàng xuống dòng được.
 */

test('dải số nằm trong vùng cắt riêng, cụm nút là ANH EM của nó', () => {
  const s = snap({ runtime: 'running', transport: { state: 'running', cost_usd: 0 } });
  const { container } = render(
    <Transport
      transport={s.transport}
      song={undefined}
      suKien={[]}
      runtime={s.runtime}
      hoatDong={s.book.activity}
    >
      <div className="dieukhien">
        <button type="button">Chạy</button>
      </div>
    </Transport>,
  );
  const thanh = container.querySelector('.trans');
  const dai = thanh?.querySelector(':scope > .dai');
  const dk = thanh?.querySelector(':scope > .dieukhien');

  expect(dai, 'dải số phải là con trực tiếp của .trans').not.toBeNull();
  expect(dk, 'cụm nút phải là con trực tiếp của .trans, không nằm trong dải').not.toBeNull();
  // Mọi ô số liệu phải nằm TRONG dải — một ô lọt ra ngoài là một ô đẩy được cụm nút.
  expect(thanh?.querySelectorAll(':scope > .cell').length).toBe(0);
  expect((dai?.querySelectorAll('.cell').length ?? 0)).toBeGreaterThan(3);
});

test('ô trạng thái mang lớp GHIM — nó không được cuộn mất khi dải bị cắt', () => {
  // DESIGN.md:108 "trạng thái máy luôn hiện, không cuộn mất". Bản mới cho dải số cuộn ngang,
  // nên lời hứa đó chuyển thành một lớp `sticky` trên đúng ô ấy. Không có lớp này thì cắt
  // dải số là cắt luôn câu trả lời chính.
  const { container } = ve('running', 'running');
  const o = container.querySelector('.trans .dai > .cell');
  expect(o?.className).toContain('ghim');
});

test('lúc nghỉ, ô "lượt trước" đọc last_call (nhà cung cấp · model), không đọc model mặc định', () => {
  const s = snap({
    runtime: 'idle',
    transport: {
      state: 'idle',
      cost_usd: 0,
      last_step: 'commit',
      model: 'mac-dinh-cu',
      last_call: { agent: 'writer', provider: '9Router', model: 'cx/gpt-5.6-luna', at: new Date().toISOString() },
    },
  });
  const { container } = render(
    <Transport transport={s.transport} song={undefined} suKien={[]} runtime={s.runtime} hoatDong={s.book.activity} />,
  );
  const o = container.querySelector('.trans .cell.to');
  expect(o?.textContent).toContain('9Router · cx/gpt-5.6-luna');
  expect(o?.textContent).toContain('vừa xong');
  expect(o?.textContent).not.toContain('mac-dinh-cu');
  // Ô "bước" là việc của lượt cũ — lúc nghỉ không hiện.
  expect(container.querySelector('.trans .cell.buoc')).toBeNull();
});
