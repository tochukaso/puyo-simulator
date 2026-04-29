use std::env;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    let target = env::var("TARGET").expect("TARGET env not set");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest.join("vendor/ama").join(&target);
    let lib_file = lib_dir.join("libama_native.a");

    if !lib_file.exists() {
        panic!(
            "missing {} — run `npm run build:ama-native:all` to populate src-tauri/vendor/ama/",
            lib_file.display()
        );
    }

    println!("cargo:rustc-link-search=native={}", lib_dir.display());
    println!("cargo:rustc-link-lib=static=ama_native");

    // libc++ for clang-built static lib
    if target.contains("apple-darwin") {
        println!("cargo:rustc-link-lib=c++");
    } else if target.contains("android") {
        println!("cargo:rustc-link-lib=c++_shared");
    }

    println!("cargo:rerun-if-changed=vendor/ama");
}
