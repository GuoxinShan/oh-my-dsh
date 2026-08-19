fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "dsh_desktop_open_external",
                "dsh_desktop_notify",
                "dsh_desktop_save_file",
                "dsh_desktop_e2e_report",
                "dsh_desktop_check_update",
                "dsh_desktop_apply_update",
            ]),
        ),
    )
    .expect("dsh-desktop: tauri build");
}
