// .NET LibreHardwareMonitor yardımcı sürecini derler ve Tauri sidecar adıyla
// (src-tauri/binaries/lhm-helper-<hedef üçlüsü>.exe) kopyalar.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

const triple = /host: (\S+)/.exec(execSync("rustc -vV", { encoding: "utf8" }))?.[1];
if (!triple) throw new Error("rustc -vV çıktısında host bulunamadı");

run("dotnet publish helper -c Release -o helper/publish");

const dest = join(root, "src-tauri", "binaries");
mkdirSync(dest, { recursive: true });
copyFileSync(join(root, "helper", "publish", "lhm-helper.exe"), join(dest, `lhm-helper-${triple}.exe`));
console.log(`Kopyalandı: src-tauri/binaries/lhm-helper-${triple}.exe`);
