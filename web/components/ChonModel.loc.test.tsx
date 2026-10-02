import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { ChonModel, type NhomModel } from './ChonModel';

/**
 * Lọc trong bộ chọn model: nhóm không khớp phải biến mất.
 *
 * Ca thật 2026-10-02: gõ "lingo2" vẫn thấy tiêu đề lingoreup, 9Router, kiraai — ba nhóm rỗng
 * đứng trên kết quả duy nhất.
 */
const nhom = (provider: string, models: string[]): NhomModel => ({
  provider,
  daKhai: models,
  daTai: [],
  taiDuoc: true,
  dangTai: false,
  daTaiLan: false,
  loi: null,
});

function mo() {
  render(
    <ChonModel
      nhom={[nhom('lingoreup', ['auto']), nhom('9Router', ['cx/gpt-5.6-luna']), nhom('lingo2', ['auto'])]}
      nhanNut="Đổi model"
      nhanTruyCap="Đổi model mặc định"
      onChon={() => {}}
      onTai={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Đổi model mặc định' }));
  return screen.getByRole('combobox');
}

const tenNhom = () => [...document.querySelectorAll('.chonModelNhom')].map((e) => e.getAttribute('aria-label'));

test('gõ tên nhà cung cấp chỉ còn nhóm đó', () => {
  fireEvent.change(mo(), { target: { value: 'lingo2' } });
  expect(tenNhom()).toEqual(['lingo2']);
});

test('gõ tên model giữ mọi nhóm có model khớp, bỏ nhóm không có', () => {
  fireEvent.change(mo(), { target: { value: 'gpt' } });
  expect(tenNhom()).toEqual(['9Router']);
});

test('ô tìm rỗng thì hiện đủ mọi nhóm', () => {
  mo();
  expect(tenNhom()).toEqual(['lingoreup', '9Router', 'lingo2']);
});
