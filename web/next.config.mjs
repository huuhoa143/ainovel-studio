import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/**
 * Xuất tĩnh, không SSR.
 *
 * Vì sao: sidecar Go của app phục vụ thư mục này bằng http.FileServer
 * (internal/serve/serve.go, routes()). Không có runtime Node bên cạnh engine Go, nên mọi thứ cần render được thành tệp tĩnh và lấy dữ
 * liệu ở phía trình duyệt. Đây cũng là lý do trạng thái chọn tác phẩm/chương
 * nằm trong query string chứ không phải route động: route động cần
 * generateStaticParams, mà danh sách tác phẩm chỉ biết lúc chạy.
 *
 * Store là dữ liệu sống nên không có gì để prerender sẵn — trang là một vỏ
 * tĩnh, dữ liệu đến từ /api và SSE.
 */
/**
 * Địa chỉ sidecar khi phát triển. Chỉ dùng cho proxy của `next dev`; bản build
 * tĩnh gọi `/api` cùng gốc và không đọc biến này.
 */
const ENGINE = process.env.AINOVEL_ENGINE ?? 'http://127.0.0.1:8420';

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
  output: 'export',

  /**
   * Chỉ ở `next dev`: bản xuất tĩnh không có tầng server để rewrite, và khai
   * rewrites lúc build thì Next in cảnh báo vô ích.
   *
   * Cần proxy vì server Go không gửi header CORS (nó chỉ lắng nghe loopback và
   * phục vụ đúng một giao diện cùng gốc). EventSource cũng chịu chung luật đó
   * nên không thể trỏ thẳng sang cổng sidecar từ cổng dev.
   */
  ...(phase === PHASE_DEVELOPMENT_SERVER
    ? {
        async rewrites() {
          return [{ source: '/api/:duong*', destination: `${ENGINE}/api/:duong*` }];
        },
      }
    : {}),

  // File tĩnh phục vụ bằng FileServer: /duong-dan/ ăn index.html, còn
  // /duong-dan thì 404. Chỉ có một route (/) nên điều này an toàn.
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },

  /**
   * `next dev` mặc định chỉ nhận tài nguyên dev từ `localhost`. Mở studio bằng
   * `127.0.0.1` — cách người ta hay gõ, và đúng địa chỉ sidecar in ra — thì chunk
   * của `import()` bị chặn im lặng: không lỗi trong console, promise không bao
   * giờ resolve, giao diện đứng ở "đang đọc store…". Chỉ ảnh hưởng dev.
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Huy hiệu dev của Next nằm đè lên góc thanh transport, tức đúng chỗ đọc
  // trạng thái máy. Tắt để ảnh chụp lúc phát triển giống bản build.
  devIndicators: false,
});

export default nextConfig;
