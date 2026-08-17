use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::Engine;

type HmacSha256 = Hmac<Sha256>;

pub struct WebhookHeaders<'a> {
    pub id: Option<&'a str>,
    pub timestamp: Option<&'a str>,
    pub signature: Option<&'a str>,
}

pub fn verify_signature(body: &str, headers: WebhookHeaders, secret: &str) -> bool {
    let (id, timestamp, signature) = match (headers.id, headers.timestamp, headers.signature) {
        (Some(i), Some(t), Some(s)) => (i, t, s),
        _ => return false,
    };

    if let Ok(ts) = timestamp.parse::<i64>() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        if (now - ts).abs() > 300 {
            return false;
        }
    } else {
        return false;
    }

    let clean_secret = secret.trim_start_matches("whsec_");
    let secret_bytes = match base64::engine::general_purpose::STANDARD.decode(clean_secret) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let mut mac = match HmacSha256::new_from_slice(&secret_bytes) {
        Ok(m) => m,
        Err(_) => return false,
    };

    let signed_content = format!("{}.{}.{}", id, timestamp, body);
    mac.update(signed_content.as_bytes());

    let expected_bytes = mac.finalize().into_bytes();
    let expected_b64 = base64::engine::general_purpose::STANDARD.encode(expected_bytes);

    let candidates: Vec<&str> = signature
        .split(' ')
        .filter_map(|part| part.split(',').nth(1))
        .collect();

    candidates.iter().any(|&cand| cand == expected_b64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invalid_headers() {
        let headers = WebhookHeaders { id: None, timestamp: None, signature: None };
        assert!(!verify_signature("{}", headers, "secret"));
    }
}
