import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { CHU, GIAI_THICH } from '@/lib/nhan';
import { BO_DEM_RONG, SO_LUOT_GIU, moLuot, themChu } from '@/lib/vanSong';

import { VanSong, laMa } from './VanSong';

/** Bộ đệm đã CHẠM trần lượt: mọi lượt còn lại đều mang nhãn, kể cả lượt đầu. */
function boDemDaCat() {
  let bd = BO_DEM_RONG;
  for (let i = 0; i <= SO_LUOT_GIU; i += 1) {
    bd = moLuot(bd, `v${i}`);
    bd = themChu(bd, `chữ ${i}`);
  }
  return bd;
}

test('vẽ chữ của mọi lượt đang giữ', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, 'chương 2 · 23:11');
  bd = themChu(bd, 'lượt hai');

  render(<VanSong boDem={bd} dangChay />);

  expect(screen.getByText('lượt một')).toBeDefined();
  expect(screen.getByText('lượt hai')).toBeDefined();
});

test('vạch ngăn hiện nhãn của lượt, và lượt đầu KHÔNG có vạch', () => {
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd, 'chương 2 · 23:11');
  bd = themChu(bd, 'lượt hai');

  const { container } = render(<VanSong boDem={bd} dangChay />);

  expect(screen.getByText('chương 2 · 23:11')).toBeDefined();
  // Hai lượt nhưng chỉ MỘT vạch: vạch là thứ ngăn giữa, không phải nhãn của mỗi khối.
  expect(container.querySelectorAll('.vach')).toHaveLength(1);
});

test('bộ đệm rỗng nói ra là chưa có gì, không để khung trắng', () => {
  render(<VanSong boDem={BO_DEM_RONG} dangChay />);
  expect(screen.getByText(/chữ sẽ hiện dần/i)).toBeDefined();
});

test('lượt đầu của bộ đệm ĐÃ BỊ CẮT vẫn không có vạch, dù nó mang nhãn', () => {
  // Bài "lượt đầu KHÔNG có vạch" ở trên KHÔNG canh được điều nó nói: bộ đệm của nó có lượt
  // đầu `nhan === undefined`, nên bỏ hẳn chốt `i > 0` vẫn cho đúng một vạch và vẫn xanh (đã
  // thử đột biến). Chốt đó chỉ làm việc ở ca này — bộ đệm đã chạm trần, lượt cũ nhất bị bỏ,
  // và lượt đứng đầu bây giờ MANG nhãn của chính nó.
  //
  // Vẽ vạch trên cùng ở đây là khẳng định có một lượt phía trên nó. Lượt đó vừa bị trần cắt
  // mất, nên vạch ấy trỏ vào một thứ người đọc không bao giờ cuộn tới được.
  const bd = boDemDaCat();
  expect(bd.luot[0]!.nhan).toBeDefined(); // nếu không thì bài này lại đo nhầm ca

  const { container } = render(<VanSong boDem={bd} dangChay />);

  expect(container.querySelectorAll('.luot')).toHaveLength(SO_LUOT_GIU);
  expect(container.querySelectorAll('.vach')).toHaveLength(SO_LUOT_GIU - 1);
});

test('lượt không có nhãn thì không vẽ vạch RỖNG', () => {
  // `moLuot` nhận nhãn là tùy chọn, nên ca này tới được. Một vạch không chữ là một đường kẻ
  // ngang không nói gì — nó chia đôi khu chữ mà không cho biết chia theo cái gì.
  let bd = themChu(BO_DEM_RONG, 'lượt một');
  bd = moLuot(bd);
  bd = themChu(bd, 'lượt hai');

  const { container } = render(<VanSong boDem={bd} dangChay />);

  expect(container.querySelectorAll('.luot')).toHaveLength(2);
  expect(container.querySelectorAll('.vach')).toHaveLength(0);
});

test('lượt bị trần cắt KHÔNG nhường nút DOM của nó cho lượt sau', () => {
  // Đây là điều mà chú thích của `LuotVan.id` khẳng định, và cho tới bài này thì không có gì
  // giữ nó: đổi `key={l.id}` thành `key={i}` vẫn xanh cả bộ (đã thử đột biến).
  //
  // Với key theo id, lượt bị bỏ mang nút DOM của nó đi theo và các lượt còn lại GIỮ nút cũ.
  // Với key theo chỉ số, mọi chỉ số dịch xuống một bậc: React coi đó là "nội dung phần tử 0
  // vừa đổi", giữ nguyên nút và thay chữ bên trong — trong một khu đang tự cuộn thì đó là
  // một cú nhảy vị trí ngay giữa lúc đọc.
  let bd = boDemDaCat();
  const { container, rerender } = render(<VanSong boDem={bd} dangChay />);
  const cu = [...container.querySelectorAll('.chu')];

  bd = moLuot(bd, 'lượt kế');
  bd = themChu(bd, 'chữ kế');
  rerender(<VanSong boDem={bd} dangChay />);
  const moi = [...container.querySelectorAll('.chu')];

  // Lượt cũ nhất bị bỏ, nên lượt đứng đầu bây giờ phải là lượt thứ HAI của lần vẽ trước —
  // đúng nút DOM đó, không phải một nút được dùng lại và thay ruột.
  expect(moi[0]).toBe(cu[1]);
  expect(moi[0]).not.toBe(cu[0]);
});

test('tên vùng KHÔNG đổi theo trạng thái máy, tiêu đề thì có', () => {
  // Tên vùng là thứ trình đọc màn hình điều hướng TỚI. Đặt nó bằng câu trạng thái thì nó
  // vừa lặp lại nội dung ngay bên dưới, vừa thành SAI khi máy chuyển sang nghỉ — cùng lớp
  // lỗi đã trả giá một lần ở dải "việc tiếp theo" (xem `CHU.vttVung`).
  const bd = themChu(BO_DEM_RONG, 'x');
  const { rerender } = render(<VanSong boDem={bd} dangChay />);

  expect(screen.getByRole('region', { name: CHU.vanSongVung })).toBeDefined();
  expect(screen.getByRole('heading', { name: CHU.mayDangNoi })).toBeDefined();

  rerender(<VanSong boDem={bd} dangChay={false} />);

  expect(screen.getByRole('region', { name: CHU.vanSongVung })).toBeDefined();
  // Bộ đệm ở bài này CÓ chữ (`themChu(..., 'x')`), nên tiêu đề của ca nghỉ là "văn của lượt
  // gần nhất", không phải "chưa có văn nào" — xem ba ca ở `VanSong.tsx`.
  expect(screen.getByRole('heading', { name: CHU.vanLuotGanNhat })).toBeDefined();
});

/** jsdom không bố cục nên ba số cuộn đều là 0; đặt tay để mô phỏng một khu đã cuộn. */
function datCuon(el: HTMLElement, v: { top: number; height: number; client: number }) {
  Object.defineProperty(el, 'scrollHeight', { value: v.height, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: v.client, configurable: true });
  el.scrollTop = v.top;
}

test('đang bám đáy thì KHÔNG hiện nút về cuối', () => {
  const bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 900, height: 1000, client: 100 });
  fireEvent.scroll(than);

  expect(screen.queryByRole('button', { name: CHU.veCuoi })).toBeNull();
});

test('cuộn lên thì hiện nút về cuối', () => {
  const bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);

  expect(screen.getByRole('button', { name: CHU.veCuoi })).toBeDefined();
});

test('bấm về cuối thì cuộn xuống đáy và nút biến mất', () => {
  const bd = themChu(BO_DEM_RONG, 'x');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);
  fireEvent.click(screen.getByRole('button', { name: CHU.veCuoi }));

  expect(than.scrollTop).toBe(1000);
  expect(screen.queryByRole('button', { name: CHU.veCuoi })).toBeNull();
});

test('chữ mới KHÔNG kéo màn hình khi người dùng đã cuộn lên', () => {
  // Đây là bài canh quan trọng nhất của Task này: tự cuộn phải nhường người đọc. Không có nó
  // thì đọc lại một đoạn dài trong lúc engine đang phát là bất khả.
  let bd = themChu(BO_DEM_RONG, 'x');
  const { container, rerender } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 100, height: 1000, client: 100 });
  fireEvent.scroll(than);

  bd = themChu(bd, 'chữ mới tới');
  rerender(<VanSong boDem={bd} dangChay />);

  expect(than.scrollTop).toBe(100);
});

test('đang bám đáy thì chữ mới KÉO màn hình xuống theo', () => {
  // Bài canh chiều THUẬN của tự cuộn, và cho tới đây không có bài nào giữ nó: bảng đột biến
  // của kế hoạch chỉ canh chiều nghịch ("đã cuộn lên thì đừng kéo"), nên xóa sạch thân effect
  // tự cuộn — tức bỏ hẳn tính năng — vẫn xanh cả bộ. Đã thử đột biến hai kiểu: bỏ thân effect,
  // và đổi deps thành `[]`; cả hai đều xanh trước khi có bài này.
  //
  // Tự cuộn là thứ ĐO ĐƯỢC trên sample.gif chứ không phải sở thích: chia khu chữ thành 8 dải
  // ngang thì bảy dải TRÊN cũng đổi 59–73 khung, tức cả khối dịch lên chứ không chỉ thêm ở đáy.
  let bd = themChu(BO_DEM_RONG, 'x');
  const { container, rerender } = render(<VanSong boDem={bd} dangChay />);
  const than = container.querySelector('.vsthan') as HTMLElement;

  datCuon(than, { top: 900, height: 1000, client: 100 });
  fireEvent.scroll(than);

  // Chữ mới làm khu cao thêm — đây là chỗ khác nhau giữa "có tự cuộn" và "không".
  Object.defineProperty(than, 'scrollHeight', { value: 1400, configurable: true });
  bd = themChu(bd, 'chữ mới tới');
  rerender(<VanSong boDem={bd} dangChay />);

  expect(than.scrollTop).toBe(1400);
});

test('vừa mở khu, chưa cuộn lần nào thì KHÔNG có nút về cuối', () => {
  // Ba bài nút ở trên đều bắn một sự kiện cuộn trước khi hỏi, nên không bài nào chạm tới
  // trạng thái ĐẦU. Đặt nhầm trạng thái đầu thành `false` thì nút "về cuối" hiện ngay lúc
  // mở khu — trên một khu chưa cuộn đi đâu cả, tức một nút không làm gì.
  render(<VanSong boDem={themChu(BO_DEM_RONG, 'x')} dangChay />);
  expect(screen.queryByRole('button', { name: CHU.veCuoi })).toBeNull();
});

test('máy nghỉ mà bộ đệm CÒN chữ thì giữ nguyên chữ, chỉ đổi tiêu đề', () => {
  // Bộ đệm còn giữ báo cáo của lượt vừa xong. Xóa nó đi lúc engine đóng là vứt thứ duy nhất
  // đang nói được điều gì đó ở vị trí đắt nhất màn hình.
  const bd = themChu(BO_DEM_RONG, 'khế ước: ✓ 4/4 · 1.874 từ');
  render(<VanSong boDem={bd} dangChay={false} />);

  expect(screen.getByText('khế ước: ✓ 4/4 · 1.874 từ')).toBeDefined();
  // Tiêu đề nói về BỘ ĐỆM, không về máy — và ca này là ca thứ ba, tách khỏi ca bộ đệm rỗng.
  // Bài này chính là bài bắt được bản sửa đầu của tôi, khi mọi ca "nghỉ" dùng chung câu
  // "Chưa có văn nào trong phiên này" — tức một câu phủ nhận đống chữ ngay dưới nó.
  expect(screen.getByRole('heading', { name: CHU.vanLuotGanNhat })).toBeDefined();
  expect(screen.queryByRole('heading', { name: CHU.mayNghi })).toBeNull();
});

test('máy nghỉ và bộ đệm RỖNG thì nói chưa có văn — ca thứ hai, không lẫn với ca trên', () => {
  render(<VanSong boDem={BO_DEM_RONG} dangChay={false} />);
  expect(screen.getByRole('heading', { name: CHU.mayNghi })).toBeDefined();
});

test('máy nghỉ và bộ đệm rỗng thì nói việc tiếp theo, không nói "chờ chữ"', () => {
  render(<VanSong boDem={BO_DEM_RONG} dangChay={false} />);
  // Khớp qua chính chuỗi trong từ điển, không viết lại nó thành một regex thứ hai: bản
  // trước dò `/bấm chạy ở thanh dưới/i` và nó đỏ khi câu thêm ký hiệu `▶` — đỏ vì một chi
  // tiết chính tả, không vì điều đang canh (dải rỗng phải nói VIỆC TIẾP THEO).
  expect(screen.getByText(GIAI_THICH.vanSongNghi)).toBeDefined();
});

test('lượt là dữ liệu máy thì mang lớp `ma`, lượt là văn thì không', () => {
  // Văn truyện vẽ serif, đối số JSON của tool vẽ mono — tách theo TỪNG lượt.
  expect(laMa('{"chapter": 2, "title": "x"}')).toBe(true);
  expect(laMa('  [1, 2, 3]')).toBe(true);
  expect(laMa('"a": 1, "b": 2, "c": 3')).toBe(true);
  expect(laMa('Nàng quay đầu lại, gió thổi qua sân "đá" lạnh.')).toBe(false);

  let bd = themChu(BO_DEM_RONG, '{"chapter": 2}');
  bd = moLuot(bd, 'chương 2');
  bd = themChu(bd, 'nàng quay đầu lại');
  const { container } = render(<VanSong boDem={bd} dangChay />);
  const chu = [...container.querySelectorAll('.chu')].map((e) => e.classList.contains('ma'));
  expect(chu).toEqual([true, false]);
});
