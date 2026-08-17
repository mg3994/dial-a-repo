use std::net::SocketAddr;
use tokio::net::UdpSocket;
use tracing::info;

pub struct SipCallSession {
    pub call_id: String,
    pub from: String,
    pub to: String,
    pub remote_media_addr: Option<SocketAddr>,
}

pub struct SipEngine {
    socket: UdpSocket,
}

impl SipEngine {
    pub async fn bind(addr: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let socket = UdpSocket::bind(addr).await?;
        info!("SIP Telephony Engine listening on UDP {}", addr);
        Ok(Self { socket })
    }

    pub async fn run_loop(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut buf = [0u8; 4096];
        loop {
            let (len, src) = self.socket.recv_from(&mut buf).await?;
            let msg = String::from_utf8_lossy(&buf[..len]);

            if msg.starts_with("INVITE") {
                info!("Received SIP INVITE from {}", src);
                if let Some(session) = Self::parse_invite(&msg) {
                    info!("Parsed SIP call: call_id={}", session.call_id);
                    let ok_response = Self::build_200_ok(&session);
                    let _ = self.socket.send_to(ok_response.as_bytes(), src).await;
                }
            }
        }
    }

    fn parse_invite(raw: &str) -> Option<SipCallSession> {
        let mut call_id = None;
        let mut from = None;
        let mut to = None;

        for line in raw.lines() {
            if line.to_lowercase().starts_with("call-id:") {
                call_id = Some(line["call-id:".len()..].trim().to_string());
            } else if line.to_lowercase().starts_with("from:") {
                from = Some(line["from:".len()..].trim().to_string());
            } else if line.to_lowercase().starts_with("to:") {
                to = Some(line["to:".len()..].trim().to_string());
            }
        }

        if let (Some(call_id), Some(from), Some(to)) = (call_id, from, to) {
            Some(SipCallSession { call_id, from, to, remote_media_addr: None })
        } else {
            None
        }
    }

    fn build_200_ok(session: &SipCallSession) -> String {
        format!(
            "SIP/2.0 200 OK\r\n\
            Via: SIP/2.0/UDP\r\n\
            From: {}\r\n\
            To: {};tag=rust_sip_tag_123\r\n\
            Call-ID: {}\r\n\
            CSeq: 1 INVITE\r\n\
            Content-Type: application/sdp\r\n\
            Content-Length: 0\r\n\r\n",
            session.from, session.to, session.call_id
        )
    }
}
