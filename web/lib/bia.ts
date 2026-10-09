/**
 * Màu bìa của một truyện — như "space" của Arc: mỗi cuốn một màu riêng, cố định theo mã.
 *
 * Bìa là NỘI DUNG (thứ đại diện cho cuốn sách), không phải khung, nên nó được phép bão hòa
 * trong khi mọi bề mặt khác giữ trung tính. Màu suy từ `id` (tên thư mục) chứ không từ tên
 * truyện: hai cuốn trùng tên vẫn phải phân biệt được bằng mắt.
 */
export interface MauBia {
  /** Ba điểm của dải chuyển trên bìa: sáng → chính → sâu. */
  sang: string;
  chinh: string;
  sau: string;
}

const BANG: MauBia[] = [
  { sang: '#3fb38f', chinh: '#16614d', sau: '#0d3b30' }, // ngọc
  { sang: '#e2737f', chinh: '#9b2f40', sau: '#5b1722' }, // son
  { sang: '#7b95ef', chinh: '#3450b3', sau: '#1d2e6e' }, // lam
  { sang: '#e9a85a', chinh: '#a35a17', sau: '#5e300a' }, // hổ phách
  { sang: '#b48ae6', chinh: '#6a3fa6', sau: '#3a1f63' }, // tím than
  { sang: '#5fc0d6', chinh: '#1f7088', sau: '#0f3d4c' }, // thiên thanh
  { sang: '#e88fbf', chinh: '#a33f78', sau: '#5c1f43' }, // hồng đào
  { sang: '#a3c46a', chinh: '#55752a', sau: '#2e4314' }, // rêu
];

function bam(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mauBia(id: string): MauBia {
  return BANG[bam(id) % BANG.length]!;
}

/** Nền bìa dạng CSS. */
export function nenBia(id: string): string {
  const m = mauBia(id);
  return `radial-gradient(120% 90% at 20% 10%, ${m.sang} 0, ${m.chinh} 55%, ${m.sau} 100%)`;
}
