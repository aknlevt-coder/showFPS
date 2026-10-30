// Tauri'nin her exe için çağırdığı imzalama komutu (tauri.conf.json → bundle.windows.signCommand;
// src-tauri klasöründen çalışır).
// Sertifika ayarlı değilse imzalamadan geçer: derleme yine çalışır, SmartScreen uyarısı kalır.
//
// Ortam değişkenleri (biri yeter):
//   .pfx dosyası:           CPO_SIGN_PFX=C:\yol\sertifika.pfx  CPO_SIGN_PFX_PASSWORD=...
//   Azure Trusted Signing:  CPO_SIGN_AZURE_DLIB=C:\yol\Azure.CodeSigning.Dlib.dll  CPO_SIGN_AZURE_METADATA=C:\yol\metadata.json
//                           (kimlik: az login ya da AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2];
if (!file) throw new Error("kullanım: node scripts/sign.mjs <dosya>");

const { CPO_SIGN_PFX: pfx, CPO_SIGN_PFX_PASSWORD: pfxPass, CPO_SIGN_AZURE_DLIB: dlib, CPO_SIGN_AZURE_METADATA: meta } = process.env;
if (!pfx && !(dlib && meta)) {
  console.log(`[imza] sertifika ayarlı değil, imzalanmadı: ${file}`);
  process.exit(0);
}

/** Windows SDK'daki en yeni x64 signtool.exe. */
function findSigntool() {
  const base = "C:/Program Files (x86)/Windows Kits/10/bin";
  const versions = existsSync(base) ? readdirSync(base).filter((v) => /^10\./.test(v)).sort().reverse() : [];
  for (const v of versions) {
    const p = join(base, v, "x64", "signtool.exe");
    if (existsSync(p)) return p;
  }
  throw new Error("signtool.exe bulunamadı (Windows SDK gerekli)");
}

// Zaman damgası: sertifikanın süresi bitse de imza geçerli kalır.
const ts = ["/fd", "SHA256", "/tr", pfx ? "http://timestamp.digicert.com" : "http://timestamp.acs.microsoft.com", "/td", "SHA256"];
const args = pfx
  ? ["sign", "/f", pfx, ...(pfxPass ? ["/p", pfxPass] : []), ...ts, file]
  : ["sign", "/v", "/dlib", dlib, "/dmdf", meta, ...ts, file];
execFileSync(findSigntool(), args, { stdio: "inherit" });
console.log(`[imza] imzalandı: ${file}`);
