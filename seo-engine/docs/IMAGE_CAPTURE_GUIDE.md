# Hướng dẫn bổ sung kho ảnh cho Blogger

Hiện kho chỉ có **4 ảnh** cho 8 cluster. Với hàng trăm bài, mỗi ảnh lặp lại hàng chục lần trên 5 blog — blog trông như trại nội dung, và ảnh giống hệt nhau là dấu vân tay nối 5 blog lại với nhau trong mắt Google.

Mục tiêu: **20–24 ảnh**, mỗi cluster 2–3 ảnh. Hệ thống đã hỗ trợ xoay vòng: cùng một topic luôn ra cùng một ảnh (để đối soát không lỗi), nhưng các topic khác nhau trong cùng nhóm sẽ được ảnh khác nhau.

---

## 1. Cần chụp gì

| Cluster | Ảnh nên có (2–3 ảnh/cluster) |
|---|---|
| `pos-operations` | Màn hình bán hàng chính · Order F&B theo bàn · Thanh toán nhiều hình thức |
| `store-closing-operations` | Chốt ca · Đối chiếu tiền mặt · Nhật ký thao tác |
| `inventory-management` | Danh sách lô và hạn sử dụng · Phiếu kiểm kê · Chuyển kho giữa chi nhánh |
| `product-management` | Danh mục hàng hóa · Bảng giá nhiều mức · Combo / đơn vị quy đổi |
| `revenue-monitoring` | Báo cáo doanh thu theo ngày · Lãi lỗ theo mặt hàng · Hàng bán chạy |
| `business-overview` | Dashboard tổng quan · Màn hình nhiều chi nhánh |
| `tax-reporting` | Sổ bán hàng S2-HKD · Tờ khai 01/CNKD · Sổ quỹ thu chi |
| `e-invoice` | Màn hình xuất hóa đơn · Tra cứu hóa đơn đã xuất |

## 2. Quy tắc chụp

- **Che sạch dữ liệu thật**: tên khách, số điện thoại, địa chỉ, số tiền cụ thể, mã số thuế. Dùng dữ liệu mẫu hoặc bôi mờ. Ảnh lọt thông tin khách là rủi ro thật, không phải chuyện thẩm mỹ.
- Kích thước đồng đều, nên **1200×675** (tỉ lệ 16:9). Chụp cả khung màn hình, đừng cắt lem nhem.
- Định dạng **PNG**, dung lượng dưới 300KB (nén bằng tinypng.com nếu nặng).
- Đặt tên không dấu, gạch ngang: `autotax-pos-order-ban.png`, `autotax-kiem-ke.png`.
- Giao diện nên ở trạng thái **có dữ liệu** — màn hình trống trơn nhìn như phần mềm chưa ai dùng.

## 3. Nộp ảnh

Bỏ tất cả vào `public/blogger/images/` rồi báo tôi. Tôi sẽ khai vào `config/content-images.json` với `alt` mô tả đúng nội dung từng ảnh (alt là thứ Google đọc, không được đặt qua loa).

Nếu muốn tự khai, mẫu như sau:

```json
{
  "imageId": "autotax-pos-order-ban",
  "publicPath": "/blogger/images/autotax-pos-order-ban.png",
  "alt": "Màn hình AutoTax POS nhận order theo từng bàn trong quán ăn",
  "clusters": ["pos-operations"]
}
```

Muốn ghim một ảnh cho đúng một bài cụ thể thì thêm `"topicIds": ["ten-topic"]` — ảnh ghim luôn được ưu tiên hơn xoay vòng.

## 4. Kiểm tra sau khi thêm

```bash
npm run test
node -e "const {resolveContentImage}=require('./src/content-images/registry.ts'); ['pos-operations','tax-reporting'].forEach(c=>console.log(c, resolveContentImage(c,'thu-nghiem').imageId))"
```

Test phải xanh và mỗi cluster phải trả về ảnh hợp lệ. Nếu báo `IMAGE_NOT_FOUND` nghĩa là còn cluster chưa có ảnh nào.
