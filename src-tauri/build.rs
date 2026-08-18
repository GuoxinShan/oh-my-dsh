fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "dsh_desktop_open_external",
                "dsh_desktop_notify",
                "dsh_desktop_save_file",
                "dsh_desktop_e2e_report",
            ]),
        ),
    )
    .expect("dsh-desktop: tauri build");
}
