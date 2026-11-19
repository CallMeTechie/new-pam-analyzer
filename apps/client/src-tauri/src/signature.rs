//! Signature check of downloaded updates, compatible with `tauri signer sign` (minisign).

use base64::Engine;

/// Checks a minisign signature created by `tauri signer sign`; key and signature are
/// base64-encoded as in `tauri.conf.json` and in the `.sig` files.
pub fn verify(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<(), String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let text = |v: &str| -> Result<String, String> {
        String::from_utf8(b64.decode(v.trim()).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
    };
    let pk = minisign_verify::PublicKey::decode(&text(pubkey_b64)?).map_err(|e| e.to_string())?;
    let sig = minisign_verify::Signature::decode(&text(signature_b64)?).map_err(|e| e.to_string())?;
    pk.verify(data, &sig, true).map_err(|e| format!("invalid signature: {e}"))
}

#[cfg(test)]
mod tests {
    use super::verify;

    // Created with `tauri signer generate` and `tauri signer sign` for this test only.
    const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEI5Nzg4NDMyMTRGQjBCRkEKUldUNkMvc1VNb1I0dVRDcXJ1MmJQUXUwYXIvbUhqTW16bE9EWFhSMURiMjIzNVpFeDBLN0JncmsK";
    const SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUNkMvc1VNb1I0dWZmRWlaTTZ6R05OZGlSRGxaYStXWWY4MlJzMG1LbVlvOEsvQ1BLd0ZBWlRMTFBoYStLUTdFcDJRVzRFeTMyR2cxbFhNbVdwUXhHQlN0NHFaVXZnWUFVPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk1MTE4MDIyCWZpbGU6cGF5bG9hZC5iaW4KcTcyTWxJU0R5V2Q4YmVJT2F4blBITGN4Tm4ySEZIdmdyenpaSVpxTS9VL3lhc3FDR2lBdDhFWlprOTRvamV2ZGxCUjdna1crYWtBL05CQ2tiVm5wQ2c9PQo=";
    const PAYLOAD: &[u8] = b"PAM test payload\n";

    #[test]
    fn accepts_a_signature_of_tauri_signer() {
        assert_eq!(verify(PAYLOAD, SIGNATURE, PUBKEY), Ok(()));
    }

    #[test]
    fn rejects_changed_files() {
        assert!(verify(b"PAM test payload, changed\n", SIGNATURE, PUBKEY).is_err());
    }

    #[test]
    fn rejects_another_key() {
        let other = include_str!("../updater.pub");
        assert!(verify(PAYLOAD, SIGNATURE, other).is_err());
    }
}
