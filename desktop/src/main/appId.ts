// Định danh app trên mọi nền tảng — MỘT chỗ: forge.config.ts dùng cho bundle id macOS và appId
// của electron-builder (từ đó suy ra GUID gỡ cài đặt NSIS + AUMID của shortcut Windows), main.ts
// dùng cho app.setAppUserModelId. Đổi giá trị này sau khi đã phát hành là bộ cài Windows coi
// như một app khác (cài song song, mất ghim taskbar) — đừng đổi.
export const APP_ID = 'com.huuhoa143.ainovelstudio';
