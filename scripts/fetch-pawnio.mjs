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

/** Geçerli Authenticode imzası ve imzalayan namazso.eu ise sürümü döndürür, değilse null. */
function verify(file) {
  const ps = `$s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; ` +
    `if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )CN=namazso\\.eu(,|$)' -and $s.SignerCertificate.Subject -match '(^|, )O=namazso(,|$)') ` +
    `{ (Get-Item -LiteralPath '${file.replace(/'/g, "''")}').VersionInfo.ProductVersion } else { exit 3 }`;
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8" }).trim() || "?";
  } catch {
    return null;
  }
}

if (existsSync(dest) && !process.argv.includes("--refresh")) {
  const v = verify(dest);
  if (v) {
    console.log(`PawnIO kurulumu hazır (${v}): src-tauri/binaries/PawnIO_setup.exe`);
    process.exit(0);
  }
  console.log("Mevcut PawnIO kurulumunun imzası geçersiz; yeniden indiriliyor.");
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`PawnIO indirilemedi: HTTP ${res.status}`);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
const v = verify(dest);
if (!v) {
  rmSync(dest, { force: true });
  throw new Error("İndirilen PawnIO kurulumunun imzası doğrulanamadı; dosya silindi.");
}
console.log(`PawnIO kurulumu indirildi ve imzası doğrulandı (${v}): src-tauri/binaries/PawnIO_setup.exe`);
