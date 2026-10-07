import { defineConfig } from 'vite';

// Forge plugin-vite tự đặt entry, định dạng cjs và external cho `electron` + module lõi của
// Node. Mọi thứ khác (kể cả electron-updater) phải được BUNDLE vào main.js: plugin chỉ đóng
// gói thư mục `.vite/`, node_modules không vào asar.
export default defineConfig({});
