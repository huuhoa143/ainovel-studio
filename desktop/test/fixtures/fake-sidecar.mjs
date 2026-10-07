// Nhị phân giả cho sidecar.test.ts: đóng vai `ainovel-cli serve` theo hợp đồng.
// Hành vi chọn bằng biến môi trường FAKE_MODE.
import http from 'node:http';

const mode = process.env.FAKE_MODE ?? 'ready';
console.log(`fake argv: ${process.argv.slice(2).join(' ')}`);
console.error('fake: một dòng stderr');

// Cổng lấy từ --addr 127.0.0.1:<cổng>, như Go. Cổng bận thì in đúng dạng lỗi của Go rồi thoát 1.
const addr = process.argv[process.argv.indexOf('--addr') + 1] ?? '127.0.0.1:0';
const wantPort = Number(addr.split(':').pop());

function listenAndAnnounce(onReady) {
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  srv.on('error', (err) => {
    console.error(`serve: listen tcp ${addr}: bind: ${err.code === 'EADDRINUSE' ? 'address already in use' : err.message}`);
    process.exit(1);
  });
  srv.listen(wantPort, '127.0.0.1', () => {
    const { port } = srv.address();
    process.stdout.write(`AINOVEL_READY http://127.0.0.1:${port}\n`);
    onReady?.(srv);
  });
  return srv;
}

switch (mode) {
  case 'ready': {
    // --exit-on-stdin-close: đọc stdin tới EOF rồi tắt êm.
    const srv = listenAndAnnounce();
    process.stdin.resume();
    process.stdin.on('end', () => {
      console.log('fake: stdin đóng, tắt êm');
      srv.close(() => process.exit(0));
    });
    break;
  }
  case 'crash-after-ready':
    listenAndAnnounce(() => {
      setTimeout(() => {
        console.error('fake: panic giả');
        process.exit(3);
      }, 200);
    });
    break;
  case 'exit-early-other':
    console.error('serve: mkdir /books: permission denied');
    process.exit(1);
    break;
  case 'never-ready':
    process.stdin.resume();
    setInterval(() => {}, 1000);
    break;
  case 'exit-early':
    console.error('serve: listen tcp 127.0.0.1:0: bind: address already in use');
    process.exit(1);
    break;
  case 'ignore-stdin':
    // Không đọc stdin, không thoát khi stdin đóng; chỉ chết khi bị kill.
    listenAndAnnounce();
    process.on('SIGTERM', () => {
      console.log('fake: nhận SIGTERM');
      process.exit(143);
    });
    setInterval(() => {}, 1000);
    break;
  case 'chatty': {
    const n = Number(process.env.FAKE_LINES ?? 500);
    for (let i = 0; i < n; i++) console.log(`dòng ${i} ${'x'.repeat(80)}`);
    listenAndAnnounce();
    process.stdin.resume();
    process.stdin.on('end', () => process.exit(0));
    break;
  }
  default:
    console.error(`FAKE_MODE lạ: ${mode}`);
    process.exit(2);
}
