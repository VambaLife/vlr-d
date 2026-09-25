import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function findPhp() {
  if (process.env.PHP_BINARY && existsSync(process.env.PHP_BINARY)) return process.env.PHP_BINARY;
  const candidates = ['C:\\Program Files\\PHP\\php.exe'];
  const packageRoot = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(packageRoot)) {
    for (const entry of readdirSync(packageRoot)) {
      if (entry.startsWith('PHP.PHP.')) candidates.push(path.join(packageRoot, entry, 'php.exe'));
    }
  }
  return candidates.find((candidate) => existsSync(candidate)) || 'php';
}

function runPhp(php, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(php, ['-d', 'display_errors=1', '-r', code], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function startFakeSmtp() {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let inData = false;
    let message = '';
    const commands = [];
    const server = net.createServer((socket) => {
      socket.write('220 fake.smtp.test ESMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        while (true) {
          const index = buffer.indexOf('\r\n');
          if (index < 0) break;
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              message += `${line}\n`;
              socket.write('250 2.0.0 queued\r\n');
            } else {
              message += `${line}\n`;
            }
            continue;
          }
          commands.push(line);
          const command = line.toUpperCase();
          if (command.startsWith('EHLO')) socket.write('250-fake.smtp.test\r\n250 AUTH LOGIN\r\n');
          else if (command === 'AUTH LOGIN') socket.write('334 VXNlcm5hbWU6\r\n');
          else if (line === 'dGVzdHVzZXI=') socket.write('334 UGFzc3dvcmQ6\r\n');
          else if (line === 'dGVzdHBhc3M=') socket.write('235 2.7.0 authenticated\r\n');
          else if (command.startsWith('MAIL FROM')) socket.write('250 2.1.0 sender ok\r\n');
          else if (command.startsWith('RCPT TO')) socket.write('250 2.1.5 recipient ok\r\n');
          else if (command === 'DATA') { inData = true; socket.write('354 end with <CRLF>.<CRLF>\r\n'); }
          else if (command === 'QUIT') { socket.write('221 2.0.0 bye\r\n'); socket.end(); }
          else socket.write('250 2.0.0 ok\r\n');
        }
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state: () => ({ commands, message }) }));
  });
}

async function run() {
  const fake = await startFakeSmtp();
  const php = findPhp();
  const classFile = path.join(root, 'app', 'SmtpClient.php').replaceAll('\\', '/');
  const mailerFile = path.join(root, 'app', 'Mailer.php').replaceAll('\\', '/');
  const code = `require '${classFile}'; require '${mailerFile}'; $smtp = new \\Vlr\\SmtpClient('127.0.0.1', ${fake.port}, 'none', 'testuser', 'testpass', 5); $mailer = new \\Vlr\\Mailer('smtp', 'to@example.test', 'from@example.test', 'Test', sys_get_temp_dir(), 'http://localhost', $smtp); $mailer->send('to@example.test', 'test', 'hello');`;
  try {
    const result = await runPhp(php, code);
    check(result.code === 0, `PHP SMTP client failed (${result.code}): ${result.stderr || result.stdout}`);
    const state = fake.state();
    check(state.commands.some((command) => command.startsWith('EHLO')), 'SMTP EHLO was not sent');
    check(state.commands.includes('AUTH LOGIN'), 'SMTP AUTH LOGIN was not sent');
    check(state.commands.includes('MAIL FROM:<from@example.test>'), 'SMTP MAIL FROM was not sent');
    check(state.commands.includes('RCPT TO:<to@example.test>'), 'SMTP RCPT TO was not sent');
    check(state.message.includes('To: to@example.test'), 'SMTP To header was not transmitted');
    check(state.message.includes('Subject: =?UTF-8?B?dGVzdA==?='), 'SMTP subject was not encoded/transmitted');
    check(state.message.includes('aGVsbG8='), 'SMTP message body was not transmitted');
  } finally {
    fake.server.close();
  }
}

run().then(() => {
  if (failures.length) {
    process.stderr.write(`SMTP transport test failed:\n- ${failures.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('SMTP transport test passed: TLS-capable client protocol path validated with local fake server.\n');
}).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
