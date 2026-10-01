/**
 * Bộ biểu tượng của studio — vẽ tay bằng SVG, một nét 1.6px, khung 24.
 *
 * Thay cho các ký tự Unicode (▤ ◆ ⌗ ☗ …) từng đứng làm biểu tượng ở rail: chúng rơi sang
 * font hệ thống, lệch đường chân chữ so với nhãn bên cạnh, và mỗi ký tự một độ đậm. Một bộ
 * nét thì mọi biểu tượng cùng một trọng lượng.
 *
 * Ký hiệu TRẠNG THÁI (● ▶ ○ ■ ◆ trong `lib/nhan.ts`) KHÔNG thuộc bộ này: chúng là kênh thứ
 * hai của dữ liệu, đứng trong dòng chữ, và Inter có sẵn glyph của chúng.
 */

const NET: Record<string, React.ReactNode> = {
  matTroi: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  trang: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  mui: <path d="m9 6 6 6-6 6" />,
  dung: <path d="M8 5v14M16 5v14" />,
  chay: <path d="M7 4.5v15l12-7.5z" />,
  gopY: (
    <>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />
    </>
  ),
  tu: (
    <>
      <path d="M5 4h3v16H5z" />
      <path d="M10 4h3v16h-3z" />
      <path d="m15.5 5.2 2.9-.8 3.6 15.3-2.9.8z" />
    </>
  ),
  cong: <path d="M12 5v14M5 12h14" />,
  yTuong: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
    </>
  ),
  tienDo: (
    <>
      <path d="M4 6h10" />
      <path d="M4 12h16" />
      <path d="M4 18h6" />
      <circle cx="17" cy="6" r="1.6" />
    </>
  ),
  doc: (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5" />
      <path d="M12 6.5C14 5 17 4.5 20.5 5v13c-3.5-.5-6.5 0-8.5 1.5" />
      <path d="M12 6.5v13" />
    </>
  ),
  nhanXet: (
    <>
      <path d="M8 4h8v3H8z" />
      <path d="M16 5.5h2a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h2" />
      <path d="m9 14 2 2 4-4.5" />
    </>
  ),
  vietLai: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  xuatBan: (
    <>
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </>
  ),
  danY: (
    <>
      <path d="M4 5h7M8 12h12M8 19h12" />
      <path d="M5 5v14h3M5 12h3" />
    </>
  ),
  nhanVat: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.6M17.5 14.9c1.6.6 2.7 2.2 3 5.1" />
    </>
  ),
  luat: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" />
    </>
  ),
  phucBut: (
    <>
      <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1Z" />
    </>
  ),
  vanPhong: (
    <>
      <path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  nhatKy: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" />
    </>
  ),
  chiPhi: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  nhomAi: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 4v4M9.5 13h.01M14.5 13h.01" />
      <path d="M9.5 16h5" />
    </>
  ),
  phien: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  khoa: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  bieuDo: (
    <>
      <path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5Z" />
      <path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z" />
    </>
  ),
};

export type TenBieuTuong = keyof typeof NET;

export function BieuTuong({ ten, co = 15 }: { ten: string; co?: number }) {
  const net = NET[ten];
  if (!net) return null;
  return (
    <svg
      className="bt"
      width={co}
      height={co}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {net}
    </svg>
  );
}
