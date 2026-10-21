import { delegateTask } from "./src/hermes.js";

// Self-check: pesan error delegate harus memuat sebab asli (exit/timeout/stderr),
// bukan cuma "Command failed: hermes -z <prompt>". Jalankan: npx tsx check-error.mts
process.env.HERMES_BIN = "hermes-tidak-ada";
try {
  await delegateTask("frontend-developer", "tulis satu file", process.cwd());
  console.log("UNEXPECTED_SUCCESS");
  process.exit(1);
} catch (error) {
  const message = (error as Error).message;
  console.log(message);
  const ok = /delegate frontend-developer gagal/.test(message) && /ENOENT/.test(message);
  console.log(ok ? "OK: sebab kegagalan ikut terbawa" : "FAIL: pesan tidak informatif");
  process.exit(ok ? 0 : 2);
}
