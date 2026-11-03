const { spawn } = require('child_process');

console.log('============================================');
console.log('   AutoTax - Đang mở đường hầm Internet');
console.log('============================================');
console.log('Đang chờ lấy Link Public từ Cloudflare...\n');

// Spawn cloudflared process
const tunnel = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3001'], {
  cwd: __dirname
});

let linkFound = false;

tunnel.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Extract URL using regex
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match && !linkFound) {
    linkFound = true;
    console.log('\n\x1b[32m\x1b[1mTHÀNH CÔNG! ĐÂY LÀ LINK CỦA BẠN:\x1b[0m');
    console.log('\x1b[36m\x1b[1m\x1b[4m' + match[0] + '\x1b[0m\n');
    console.log('=> Copy link này và gửi cho khách hàng của bạn.');
    console.log('=> Máy tính hiện đang hoạt động như một Server. KHÔNG TẮT cửa sổ này!');
  }
});

tunnel.on('close', (code) => {
  console.log(`Cloudflare Tunnel đã đóng (Mã lỗi: ${code})`);
});
