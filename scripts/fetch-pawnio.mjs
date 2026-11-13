// PawnIO kurulumunu (CPU sıcaklığı için sürücü) src-tauri/binaries/ altına indirir; showFPS kurulumu
// onu uygulama klasörüne koyar ve PawnIO kurulu değilse sessizce çalıştırır (windows/hooks.nsh).
//
// PawnIO GPL-2.0 lisanslıdır; kurulum dosyası değiştirilmeden dağıtılır, kaynağı:
// https://github.com/namazso/PawnIO. Dosya yalnız yayıncının (namazso.eu) geçerli imzasını
// taşıyorsa kabul edilir. Varsa ve imzası geçerliyse yeniden indirilmez; --refresh ile yenilenir.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL = "https://github.com/namazso/PawnIO.Setup/releases/latest/download/PawnIO_setup.exe";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "src-tauri", "binaries", "PawnIO_setup.exe");

// CI'da hata mesajı GitHub'ın herkese açık hata özetine (annotation) düşsün.
const fail = (msg) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${msg}`);
  throw new Error(msg);
};

/** İmza durumu: { version } geçerliyse, değilse { why } (durum ve imzalayan). */
function verify(file) {
  const f = file.replace(/'/g, "''");
  const ps = `$s = Get-AuthenticodeSignature -LiteralPath '${f}'; ` +
    `if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )CN=namazso\\.eu(,|$)' -and $s.SignerCertificate.Subject -match '(^|, )O=namazso(,|$)') ` +
    `{ 'OK ' + (Get-Item -LiteralPath '${f}').VersionInfo.ProductVersion } else { 'NO ' + $s.Status + ' | ' + $s.StatusMessage + ' | ' + $s.SignerCertificate.Subject }`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" }).trim();
    return out.startsWith("OK ") ? { version: out.slice(3) || "?" } : { why: out.slice(3) };
  } catch (e) {
    return { why: String(e.message || e).split("\n")[0] };
  }
}

if (existsSync(dest) && !process.argv.includes("--refresh")) {
  const { version: v } = verify(dest);
  if (v) {
    console.log(`PawnIO kurulumu hazır (${v}): src-tauri/binaries/PawnIO_setup.exe`);
    process.exit(0);
  }
  console.log("Mevcut PawnIO kurulumunun imzası geçersiz; yeniden indiriliyor.");
}

const res = await fetch(URL).catch((e) => fail(`PawnIO indirilemedi: ${e.message}`));
if (!res.ok) fail(`PawnIO indirilemedi: HTTP ${res.status}`);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
const { version: v, why } = verify(dest);
if (!v) {
  rmSync(dest, { force: true });
  fail(`İndirilen PawnIO kurulumunun imzası doğrulanamadı (${why}); dosya silindi.`);
}
console.log(`PawnIO kurulumu indirildi ve imzası doğrulandı (${v}): src-tauri/binaries/PawnIO_setup.exe`);
