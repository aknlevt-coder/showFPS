// Uygulama simgelerini ve NSIS kurulum görsellerini src-tauri/icons/source/app-icon.svg'den üretir.
//   - Masaüstü simgeleri: `tauri icon` (yalnız Windows'un kullandıkları kopyalanır; mobil klasörler atlanır)
//   - Kurulum görselleri (BMP): Edge'in başsız modunda HTML'den PNG, sonra System.Drawing ile 24-bit BMP
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src-tauri", "icons");
const svgPath = join(icons, "source", "app-icon.svg");
const tmp = mkdtempSync(join(tmpdir(), "cpo-icons-"));

try {
  // 1) Masaüstü simgeleri
  const gen = join(tmp, "gen");
  execSync(`npx tauri icon "${svgPath}" -o "${gen}"`, { cwd: root, stdio: "ignore" });
  for (const f of ["32x32.png", "64x64.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico"]) {
    copyFileSync(join(gen, f), join(icons, f));
  }
  // Panel logosu ve sekme simgesi aynı kaynaktan.
  copyFileSync(svgPath, join(root, "public", "app-icon.svg"));

  // 2) Kurulum görselleri
  const edge = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"]
    .find(existsSync);
  if (!edge) throw new Error("Microsoft Edge bulunamadı (kurulum görselleri için gerekli)");
  const svg = readFileSync(svgPath, "utf8");
  const page = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:"Segoe UI",sans-serif}
    svg{display:block}</style><body>${body}</body>`;
  const icon = (size) => svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);

  const shots = {
    // Hoş geldiniz/bitiş sayfalarının solundaki dikey görsel (164×314)
    sidebar: [164, 314, `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      background:linear-gradient(165deg,#0f0c29 0%,#1b1745 60%,#3c3489 100%);color:#fff;text-align:center">
      ${icon(84)}
      <div style="font-weight:700;font-size:20px;letter-spacing:.2px">show<span style="color:#5DCAA5">FPS</span></div>
      <div style="font-size:11px;color:#c7c3f5;line-height:1.4">FPS · CPU · GPU<br>overlay</div></div>`],
    // Diğer sayfaların üst şeridindeki görsel (150×57, beyaz zemin, solda)
    header: [150, 57, `<div style="height:100%;display:flex;align-items:center;padding-left:10px;background:#fff">${icon(40)}</div>`],
  };

  for (const [name, [w, h, body]] of Object.entries(shots)) {
    const html = join(tmp, `${name}.html`);
    const png = join(tmp, `${name}.png`);
    writeFileSync(html, page(w, h, body));
    execFileSync(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${h}`,
      `--screenshot=${png}`, pathToFileURL(html).href], { stdio: "ignore" });
    const bmp = join(icons, `installer-${name}.bmp`);
    // NSIS 24-bit BMP ister; Edge'in ölçeklemesine karşı tam boyuta yeniden çizilir.
    execFileSync("powershell.exe", ["-NoProfile", "-Command",
      `Add-Type -AssemblyName System.Drawing; $s=[Drawing.Image]::FromFile('${png}'); ` +
      `$b=New-Object Drawing.Bitmap ${w},${h},([Drawing.Imaging.PixelFormat]::Format24bppRgb); ` +
      `$g=[Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,${w},${h}); ` +
      `$b.Save('${bmp}',[Drawing.Imaging.ImageFormat]::Bmp); $g.Dispose(); $b.Dispose(); $s.Dispose()`], { stdio: "inherit" });
  }
  console.log("Simgeler ve kurulum görselleri güncellendi: src-tauri/icons");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
