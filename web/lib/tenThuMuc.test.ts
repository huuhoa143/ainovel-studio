import { describe, expect, it } from 'vitest';
import { goiYTenThuMuc } from './tenThuMuc';

describe('goiYTenThuMuc', () => {
  it('bỏ phần khung để tên nói được truyện nào', () => {
    expect(goiYTenThuMuc('Truyện ngắn 3 chương: một nhiếp ảnh gia già ở Hội An')).toBe(
      'nhiep-anh-gia-gia-o',
    );
  });
  it('bỏ lời nhờ viết', () => {
    expect(goiYTenThuMuc('Viết cho tôi một tiểu thuyết về đồng hồ quả lắc')).toBe(
      'dong-ho-qua-lac',
    );
  });
  it('toàn chữ khung thì giữ cách cũ thay vì để trống', () => {
    expect(goiYTenThuMuc('Truyện ngắn 3 chương')).toBe('truyen-ngan-3-chuong');
  });
  it('không có chữ chuyển được thì rỗng', () => {
    expect(goiYTenThuMuc('!!! ???')).toBe('');
  });
});
