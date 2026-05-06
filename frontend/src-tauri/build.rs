use std::{env, fs, path::Path};

const XOR_KEY: &[u8] = b"ch19-blk-obfuscation-xor-key-32x";

fn xor_obfuscate(s: &str) -> Vec<u8> {
    s.bytes()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect()
}

fn bytes_literal(v: &[u8]) -> String {
    let inner: Vec<String> = v.iter().map(|b| b.to_string()).collect();
    format!("[{}]", inner.join(", "))
}

fn main() {
    tauri_build::build();

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest = Path::new(&out_dir).join("block_library_secrets.rs");

    let root_folder_id = env::var("DRIVE_ROOT_FOLDER_ID").unwrap_or_default();
    let drive_api_key = env::var("DRIVE_API_KEY").unwrap_or_default();

    let root_enc = xor_obfuscate(&root_folder_id);
    let key_enc = xor_obfuscate(&drive_api_key);

    let root_enc_len = root_enc.len();
    let key_enc_len = key_enc.len();

    let code = format!(
        r#"
const XOR_KEY: &[u8] = b"ch19-blk-obfuscation-xor-key-32x";

pub(crate) const DRIVE_ROOT_FOLDER_ID_ENC: &[u8] = &{root_enc_bytes};
pub(crate) const DRIVE_API_KEY_ENC: &[u8] = &{key_enc_bytes};

pub(crate) fn _deobfuscate(enc: &[u8]) -> String {{
    let bytes: Vec<u8> = enc
        .iter()
        .enumerate()
        .map(|(i, &b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect();
    String::from_utf8(bytes).unwrap_or_default()
}}

pub(crate) fn _is_empty_slot(enc: &[u8]) -> bool {{
    enc.is_empty() || _deobfuscate(enc).trim().is_empty()
}}
"#,
        root_enc_bytes = bytes_literal(&root_enc),
        key_enc_bytes = bytes_literal(&key_enc),
    );

    // suppress unused variable warnings from lengths
    let _ = root_enc_len;
    let _ = key_enc_len;

    fs::write(&dest, code).expect("failed to write block_library_secrets.rs");

    println!("cargo:rerun-if-env-changed=DRIVE_ROOT_FOLDER_ID");
    println!("cargo:rerun-if-env-changed=DRIVE_API_KEY");
}
