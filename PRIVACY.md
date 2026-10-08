<!-- legal-version: 1 -->
# Chính sách quyền riêng tư — AINovel Studio

**Phiên bản 1 · Có hiệu lực từ 2026-10-09** · [English below](#english)

AINovel Studio là phần mềm mã nguồn mở chạy **hoàn toàn trên máy của bạn**. Dự án không vận
hành máy chủ nào nhận dữ liệu của bạn, không có tài khoản, không thu thập số liệu sử dụng
(telemetry), không có phân tích hành vi (analytics), không có báo cáo sự cố tự động.

Trang này mô tả **chính xác** mọi chỗ app gửi dữ liệu ra khỏi máy và mọi thứ nó lưu trên đĩa.
Nó được viết dựa trên mã nguồn; nếu bạn thấy mã làm khác những gì ghi ở đây, đó là lỗi — xin
[báo cho chúng tôi](#liên-hệ).

## 1. App gửi gì ra mạng

Chỉ có bốn loại kết nối ra ngoài. Không có loại nào đi tới máy chủ của dự án này.

### 1.1. Nhà cung cấp AI do bạn cấu hình

Đây là chức năng chính của app. Khi engine chạy (và khi bạn bấm kiểm tra kết nối trong phần cài
đặt model), sidecar gửi yêu cầu HTTPS **thẳng tới địa chỉ (base URL) của nhà cung cấp bạn đã
nhập** — ví dụ OpenAI, Anthropic, Google, OpenRouter, DeepSeek, một gateway tự dựng, hoặc một
máy chủ chạy cục bộ như Ollama.

Dữ liệu được gửi gồm:

- **khóa API** của bạn (trong header xác thực);
- **nội dung để model viết tiếp**: yêu cầu/tiền đề bạn nhập, dàn ý, hồ sơ nhân vật, luật thế
  giới, tóm tắt và nội dung các chương, bản nháp, góp ý bạn gửi trong lúc viết, luật viết và văn
  phong bạn đặt, nội dung truyện bạn nhập vào app — cùng các prompt hệ thống của app;
- tên model và tham số gọi (độ dài tối đa, mức suy luận…);
- khi kiểm tra kết nối: một yêu cầu liệt kê model (`GET …/models`) và, nếu bạn chọn kiểm khả năng
  gọi công cụ, một câu chat ngắn cố định ("Gọi công cụ ping.").

Nhà cung cấp AI nhận được những dữ liệu đó cùng địa chỉ IP của bạn, và **chính sách quyền riêng
tư cũng như điều khoản của nhà cung cấp đó áp dụng** — bao gồm việc họ có lưu, ghi log hay dùng
dữ liệu để huấn luyện model hay không. Hãy đọc chính sách của nhà cung cấp trước khi đưa nội dung
nhạy cảm vào truyện. Nếu bạn dùng gateway trung gian (OpenRouter, proxy tự dựng…), cả gateway lẫn
nhà cung cấp phía sau nó đều có thể thấy dữ liệu.

### 1.2. Danh sách model công khai của OpenRouter

Khi sidecar khởi động, nếu bản lưu tạm cũ hơn 24 giờ hoặc chưa có, nó tải danh sách model công
khai từ `https://openrouter.ai/api/v1/models` để biết giá và cửa sổ ngữ cảnh của các model
(dùng cho phần tính chi phí). Việc này xảy ra **kể cả khi bạn không dùng OpenRouter**.

- Gửi đi: một yêu cầu `GET` không kèm khóa API, không kèm nội dung truyện hay bất kỳ dữ liệu nào
  của bạn. OpenRouter thấy địa chỉ IP và User-Agent mặc định của Go.
- Tần suất: tối đa một lần mỗi 24 giờ (mỗi lần mở app khi bản lưu đã hết hạn).
- Lưu ở: `models-cache.json` trong thư mục dữ liệu của app.

### 1.3. Kiểm tra bản cập nhật (GitHub Releases)

Bản cài đặt chính thức tự kiểm tra cập nhật mỗi lần mở app và khi bạn chọn **Kiểm tra cập
nhật…** trong menu. Thư viện `electron-updater` gửi yêu cầu HTTPS tới GitHub (`github.com`, và
máy chủ tải tệp của GitHub khi có bản mới) để đọc danh sách phát hành của
`huuhoa143/ainovel-studio` và tải bản cập nhật về.

- GitHub thấy: địa chỉ IP, User-Agent, và header `x-user-staging-id` — một mã ngẫu nhiên (UUID)
  do `electron-updater` tạo một lần và lưu trong tệp `.updaterId` ở thư mục dữ liệu của app. Mã
  này dùng để chia đợt phát hành, không gắn với danh tính của bạn; xóa tệp đó thì lần sau app tạo
  mã mới. Phiên bản app bạn đang dùng có thể suy ra từ tệp được tải.
- Không gửi: nội dung truyện, cấu hình, khóa API.
- Áp dụng: [Tuyên bố quyền riêng tư của GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- Bản dựng từ mã nguồn ở chế độ dev không kiểm tra cập nhật.

### 1.4. Những gì bạn tự cấu hình

- **Lệnh thông báo** (`notify.command` trong `config.json`): mặc định app chỉ hiện thông báo của hệ
  điều hành, không gọi mạng. Nếu bạn tự đặt một lệnh (ví dụ `curl` tới một dịch vụ đẩy thông báo),
  lệnh đó nhận tiêu đề và nội dung thông báo (sự kiện như "chạy xong", "chạm ngân sách") và gửi đi
  đâu là do bạn quyết định.
- **Liên kết trong app** (tài liệu, trang phát hành…) mở bằng trình duyệt mặc định của bạn, theo
  chính sách của trang đó.

### Không có gì khác

- Giao diện là tệp tĩnh đóng gói sẵn, phục vụ từ `127.0.0.1`. Font chữ được nhúng lúc build —
  không có yêu cầu tới Google Fonts hay CDN nào lúc chạy.
- Kiểm tra chính tả của Chromium bị tắt trong mọi cửa sổ, nên app không tải từ điển chính tả từ
  máy chủ nào.
- API nội bộ của app chỉ nghe trên loopback (`127.0.0.1`) và từ chối yêu cầu từ trang web khác.
- Không telemetry, không analytics, không báo cáo lỗi tự động, không quảng cáo.

## 2. App lưu gì trên máy bạn

Mọi dữ liệu nằm trong **thư mục dữ liệu của app**:

- macOS: `~/Library/Application Support/AINovel Studio/`
- Windows: `%APPDATA%\AINovel Studio\`

| Tệp / thư mục | Nội dung |
|---|---|
| `config.json` | Cấu hình, **gồm khóa API dạng văn bản thường (không mã hóa)**. Trên macOS tệp được đặt quyền `0600` (chỉ tài khoản của bạn đọc được); trên Windows nó thừa hưởng quyền của thư mục hồ sơ người dùng. |
| `books/` | Toàn bộ dữ liệu từng truyện: chương, bản nháp, tóm tắt, dàn ý, nhân vật, báo cáo duyệt, checkpoint, nhật ký phán quyết, chi phí. |
| `logs/` | `main.log`, `sidecar.log` — nhật ký vận hành. Có thể chứa tên truyện, tên model, thông báo lỗi từ nhà cung cấp và trích đoạn phản hồi. App không chủ động ghi khóa API vào log, nhưng hãy đọc lại trước khi gửi log cho ai. |
| `rules/`, `style/` | Luật viết và văn phong bạn tự đặt. |
| `models-cache.json` | Bản lưu tạm danh sách model của OpenRouter (mục 1.2). |
| `window-state.json`, `sidecar-port` | Vị trí/kích thước cửa sổ; cổng nội bộ lần chạy trước. |
| `.updaterId` | Mã ngẫu nhiên của bộ cập nhật (mục 1.3). |
| `.legacy-migrated`, `.import-staging/` | Dấu đã chuyển dữ liệu cũ; chỗ chép tạm khi nhập truyện. |
| Các thư mục của Chromium (`Cache`, `Code Cache`, `GPUCache`, `Local Storage`, `Session Storage`, `Preferences`…) | Bộ nhớ đệm và trạng thái giao diện do Electron/Chromium tạo. |

Ngoài thư mục trên:

- Bộ cập nhật giữ bản tải về trong `~/Library/Caches/ainovel-studio-desktop-updater` (macOS)
  hoặc `%LOCALAPPDATA%\ainovel-studio-desktop-updater` (Windows).
- Nếu trước đây bạn dùng bản CLI, lần mở đầu app **chép** `~/.ainovel/config.json`, `rules/` và
  `style/` sang thư mục dữ liệu mới — và **để nguyên bản cũ**. `~/.ainovel/config.json` vẫn chứa
  khóa API cũ.
- Tệp bạn xuất ra (EPUB, TXT) được tải về như mọi tệp tải xuống — thường vào thư mục Tải về.

Dữ liệu chỉ rời máy theo những đường ở mục 1. Sao lưu là việc của bạn — xem
[DISCLAIMER.md](DISCLAIMER.md).

## 3. Xóa dữ liệu

1. Thoát app.
2. Gỡ app: macOS — kéo **AINovel Studio** từ Applications vào Thùng rác; Windows — **Cài đặt →
   Ứng dụng → AINovel Studio → Gỡ cài đặt**. Gỡ app **không** xóa dữ liệu của bạn.
3. Xóa thư mục dữ liệu ở mục 2 (cùng thư mục cache của bộ cập nhật). **Thao tác này xóa vĩnh
   viễn mọi truyện** — sao lưu `books/` trước nếu muốn giữ.
4. Nếu có, xóa `~/.ainovel/` (macOS) hoặc `%USERPROFILE%\.ainovel\` (Windows) do bản CLI cũ để
   lại.
5. Muốn chắc chắn khóa API không còn hiệu lực: thu hồi (revoke) khóa trên trang của nhà cung cấp.

Dữ liệu đã gửi tới nhà cung cấp AI hay GitHub nằm ngoài tầm của app — liên hệ họ theo chính sách
của họ.

## 4. Trẻ em

App không nhắm tới trẻ em và không thu thập dữ liệu của bất kỳ ai. Điều khoản của nhà cung cấp AI
thường có giới hạn độ tuổi riêng.

## 5. Thay đổi chính sách

Khi chính sách đổi, số phiên bản ở đầu trang (và dòng `legal-version` trong mã nguồn tệp này)
tăng lên, và thay đổi được ghi trong [CHANGELOG.md](CHANGELOG.md). Lịch sử đầy đủ nằm trong git.

## Liên hệ

- Câu hỏi, góp ý: [GitHub Issues](https://github.com/huuhoa143/ainovel-studio/issues).
- Vấn đề bảo mật (ví dụ rò khóa API): **đừng mở issue công khai** — dùng
  [Report a vulnerability](https://github.com/huuhoa143/ainovel-studio/security/advisories/new),
  xem [SECURITY.md](SECURITY.md).

---

## English

**Version 1 · Effective 2026-10-09**

AINovel Studio is open-source software that runs **entirely on your computer**. The project
operates no server that receives your data. There are no accounts, no telemetry, no analytics
and no automatic crash reporting.

This page describes **exactly** where the app sends data off your machine and what it stores on
disk. It is written from the source code; if the code behaves differently, that is a bug —
please [tell us](#contact).

### 1. What the app sends over the network

There are only four kinds of outbound connection. None of them goes to a server run by this
project.

**1.1. The AI provider you configure.** This is the app's core function. While the engine runs
(and when you test a connection in the model settings), the sidecar sends HTTPS requests
**directly to the base URL of the provider you entered** — e.g. OpenAI, Anthropic, Google,
OpenRouter, DeepSeek, a self-hosted gateway, or a local server such as Ollama. It sends:

- your **API key** (in the authentication header);
- **the material the model writes from**: your brief/premise, outline, character sheets, world
  rules, chapter summaries and chapter text, drafts, notes you send while it writes, your
  writing rules and style, any novel you import — together with the app's system prompts;
- the model name and call parameters;
- when testing a connection: a model-list request (`GET …/models`) and, if you ask for a
  tool-calling check, one short fixed chat message.

The provider receives this data and your IP address, and **its own privacy policy and terms
apply** — including whether it stores, logs, or trains on your data. Read it before putting
sensitive material into a story. With an intermediary gateway (OpenRouter, your own proxy…),
both the gateway and the provider behind it may see the data.

**1.2. OpenRouter's public model list.** On sidecar start, if the local copy is missing or older
than 24 hours, the app downloads `https://openrouter.ai/api/v1/models` to learn model prices and
context windows (used for cost tracking). This happens **even if you do not use OpenRouter**. It
is a plain `GET` with no API key and none of your data; OpenRouter sees your IP address and Go's
default User-Agent. At most once per 24 hours; cached as `models-cache.json` in the app data
folder.

**1.3. Update checks (GitHub Releases).** Official builds check for updates at every launch and
when you choose **Check for updates…** in the menu. `electron-updater` contacts GitHub
(`github.com` and GitHub's download hosts when an update exists) to read the release feed of
`huuhoa143/ainovel-studio` and download the update. GitHub sees your IP address, User-Agent, and
an `x-user-staging-id` header — a random UUID that `electron-updater` creates once and stores in
`.updaterId` in the app data folder, used for staged rollouts and not tied to your identity
(delete the file and a new one is created). Your current app version can be inferred from the
files requested. No story content, configuration or API key is sent.
[GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)
applies. Development builds do not check for updates.

**1.4. Things you configure yourself.** By default notifications are local OS notifications with
no network access. If you set `notify.command` in `config.json` (e.g. a `curl` to a push
service), that command receives the notification title and body (events such as "run finished",
"budget reached") and sends them wherever you told it to. Links in the app open in your default
browser under that site's policy.

**Nothing else.** The interface is static files bundled with the app and served from
`127.0.0.1`; fonts are embedded at build time, so there are no runtime requests to Google Fonts
or any CDN. Chromium's spell-checker is disabled in every window, so no spelling dictionaries are
downloaded. The internal API listens on loopback only and rejects requests from other web pages.
No telemetry, analytics, automatic error reporting or ads.

### 2. What the app stores on your computer

Everything lives in the **app data folder**:

- macOS: `~/Library/Application Support/AINovel Studio/`
- Windows: `%APPDATA%\AINovel Studio\`

| File / folder | Contents |
|---|---|
| `config.json` | Settings, **including your API keys in plain text (not encrypted)**. On macOS the file is mode `0600` (readable only by your account); on Windows it inherits the permissions of your user profile folder. |
| `books/` | All data for each novel: chapters, drafts, summaries, outline, characters, reviews, checkpoints, decision log, costs. |
| `logs/` | `main.log`, `sidecar.log` — operational logs. May contain novel names, model names, provider error messages and response excerpts. The app does not deliberately log API keys, but review logs before sharing them. |
| `rules/`, `style/` | Your writing rules and styles. |
| `models-cache.json` | Cached OpenRouter model list (1.2). |
| `window-state.json`, `sidecar-port` | Window position/size; last internal port. |
| `.updaterId` | Random updater ID (1.3). |
| `.legacy-migrated`, `.import-staging/` | Migration marker; scratch space for imports. |
| Chromium folders (`Cache`, `Code Cache`, `GPUCache`, `Local Storage`, `Session Storage`, `Preferences`…) | Caches and UI state created by Electron/Chromium. |

Outside that folder: downloaded updates are kept in
`~/Library/Caches/ainovel-studio-desktop-updater` (macOS) or
`%LOCALAPPDATA%\ainovel-studio-desktop-updater` (Windows). If you used the old CLI, the first
launch **copies** `~/.ainovel/config.json`, `rules/` and `style/` into the new folder and
**leaves the originals in place** — `~/.ainovel/config.json` still holds your old API key.
Exports (EPUB, TXT) are saved like any download — usually to your Downloads folder.

Data leaves your machine only through the paths in section 1. Backups are your responsibility —
see [DISCLAIMER.md](DISCLAIMER.md).

### 3. Deleting your data

1. Quit the app.
2. Uninstall it: macOS — drag **AINovel Studio** from Applications to the Trash; Windows —
   **Settings → Apps → AINovel Studio → Uninstall**. Uninstalling does **not** remove your data.
3. Delete the app data folder from section 2 (and the updater cache folder). **This permanently
   deletes every novel** — back up `books/` first if you want to keep them.
4. If present, delete `~/.ainovel/` (macOS) or `%USERPROFILE%\.ainovel\` (Windows) left by the
   old CLI.
5. To be sure an API key can no longer be used, revoke it on the provider's website.

Data already sent to an AI provider or to GitHub is outside the app's reach — contact them under
their policies.

### 4. Children

The app is not directed at children and collects no one's data. AI providers' terms usually
carry their own age limits.

### 5. Changes

When this policy changes, the version number at the top (and the `legal-version` line in this
file's source) is incremented and the change is noted in [CHANGELOG.md](CHANGELOG.md). Full
history is in git.

### Contact

- Questions and feedback: [GitHub Issues](https://github.com/huuhoa143/ainovel-studio/issues).
- Security issues (e.g. an API key leak): **do not open a public issue** — use
  [Report a vulnerability](https://github.com/huuhoa143/ainovel-studio/security/advisories/new);
  see [SECURITY.md](SECURITY.md).
