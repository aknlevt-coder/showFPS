// Sürüm paketi: sürümü bir artırır, imzalı güncelleme dosyalarıyla derler ve GitHub Releases'e
// yüklenecek dosyaları release/v<sürüm>/ klasörüne koyar:
//   showFPS_<sürüm>_x64-setup.exe                    (kurulum; güncelleyici de bunu indirir)
//   latest.json                                       (güncelleyicinin okuduğu dosya)
// GitHub'da "v<sürüm>" etiketli bir sürüm oluşturup bu iki dosyayı yüklemek yeterli.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, env) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

// Güncelleme imza anahtarı depo dışında durur; kaybolursa kurulu uygulamalar yeni sürümleri kabul etmez.
const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH ?? join(homedir(), ".tauri", "cpo-updater.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && !existsSync(keyPath)) {
  throw new Error(`Güncelleme imza anahtarı yok: ${keyPath} (npx tauri signer generate -w "${keyPath}" --ci)`);
}

// --no-bump: derleme yarıda kaldıysa aynı sürümü yeniden dene.
if (!process.argv.includes("--no-bump")) run("npm version patch --no-git-tag-version");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
run("npx tauri build", {
  TAURI_SIGNING_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY ?? readFileSync(keyPath, "utf8"),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
});

const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const nsis = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const built = join(nsis, `${conf.productName}_${version}_x64-setup.exe`);
// GitHub dosya adlarındaki boşlukları noktaya çevirir; adres tutsun diye boşluksuz ad.
const asset = `showFPS_${version}_x64-setup.exe`;
const out = join(root, "release", `v${version}`);
mkdirSync(out, { recursive: true });
copyFileSync(built, join(out, asset));

// Güncelleme adresindeki depo (…/github.com/<kullanıcı>/<depo>/releases/latest/download/latest.json).
const endpoint = conf.plugins.updater.endpoints[0];
const repo = /github\.com\/([^/]+\/[^/]+)\/releases/.exec(endpoint)?.[1];
const latest = {
  version,
  notes: `showFPS ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(`${built}.sig`, "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/v${version}/${asset}`,
    },
  },
};
writeFileSync(join(out, "latest.json"), JSON.stringify(latest, null, 2) + "\n");

console.log(`\nYayın dosyaları: release/v${version}/ (${asset}, latest.json)`);
if (!repo) {
  console.log("UYARI: güncelleme adresi GitHub sürüm adresi değil (tauri.conf.json → plugins.updater.endpoints).");
}
