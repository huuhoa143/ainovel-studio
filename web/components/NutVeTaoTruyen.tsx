import { TU_TRUYEN as T } from '@/lib/chu/tu-truyen';

import { BieuTuong } from './BieuTuong';

/**
 * Đường về biểu mẫu tạo truyện, đứng đầu màn — CHỈ khi xưởng chưa có truyện nào.
 *
 * Xưởng rỗng không có rail (xem nhánh `xuongTrong` ở `app/page.tsx`): biểu mẫu tạo truyện là
 * màn nhà, và hai màn nó dẫn sang (Model & khóa API, Bàn ý tưởng) phải tự mang lối về. Không có
 * nút này thì sang được mà không về được — app desktop không có thanh địa chỉ hay nút Back.
 */
export function NutVeTaoTruyen({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="nutPhu" onClick={onClick}>
      <BieuTuong ten="lui" co={13} />
      {T.veTaoTruyen}
    </button>
  );
}
