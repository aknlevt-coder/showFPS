fn main() {
    // Yalnızca release (kurulum paketi) yönetici ister (FPS için ETW, CPU sıcaklığı için PawnIO).
    // Dev derlemesinde de isteseydi yükseltilmemiş terminalden `npm run tauri dev`
    // "yükseltme gerekli" (740) ile açılamazdı.
    // app-admin.manifest saf ASCII kalmalı; Türkçe karakter gömülü manifesti bozar (SideBySide 14001).
    println!("cargo:rerun-if-changed=app-admin.manifest");
    let mut attrs = tauri_build::Attributes::new();
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        attrs = attrs.windows_attributes(
            tauri_build::WindowsAttributes::new().app_manifest(include_str!("app-admin.manifest")),
        );
    }
    tauri_build::try_build(attrs).expect("tauri-build başarısız");
}
