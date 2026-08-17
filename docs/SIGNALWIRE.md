# How SignalWire Works Internally in Dial-a-Repo

This document explains how **SignalWire** operates internally within the **Dial-a-Repo** architecture, including telephony provisioning, SIP Gateway routing, TLS audio trunking, and how it interacts with xAI and Cloudflare Workers.

---

## 1. What is SignalWire's Role?

In Dial-a-Repo, **SignalWire** serves as the **Public Switched Telephone Network (PSTN) Telephony Provider**.

While xAI handles the AI speech generation and Cloudflare handles the application control logic, neither xAI nor Cloudflare natively provisions or routes inbound phone numbers directly from carrier networks in this setup. SignalWire sits at the PSTN boundary:

1. **Owns & Hosts the Phone Number:** Hosts `+1 (607) 365-4321`.
2. **PSTN to SIP Bridging:** Converts traditional carrier phone network calls (PSTN / ISUP) into secure SIP (Session Initiation Protocol) packets over TLS.
3. **Direct Media Trunking:** Forwards live audio (RTP streams) directly to xAI's SIP servers without passing through Cloudflare.

---

## 2. SignalWire Internal Telephony Flow

```
+-------------------+           PSTN Carrier Network
|  Caller's Phone   | ------------------------------------------+
+-------------------+                                           |
                                                                v
+-------------------------------------------------------------------+
|                       SIGNALWIRE INFRASTRUCTURE                  |
|                                                                   |
|   +-------------------+              +------------------------+   |
|   | PSTN Ingress Switch| ----------->| SIP Gateway Resource   |   |
|   | (San Diego/Dallas)|              | (Forwarding Rule)      |   |
|   +-------------------+              +------------------------+   |
+---------------------------------------------------|---------------+
                                                    |
                                       SIP / TLS (Direct RTP Stream)
                                                    v
                                  +-----------------------------------+
                                  |     xAI Direct SIP Endpoint       |
                                  | sip:+16073654321@sip.voice.x.ai   |
                                  +-----------------------------------+
```

---

## 3. Step-by-Step Call Execution in SignalWire

### Step 1: Inbound Call Ingress
When a caller dials `+1 (607) 365-4321`:
* The caller's mobile network or local exchange routes the call across the PSTN to SignalWire's regional ingress switches.
* SignalWire answers the initial ISUP/SS7 signaling and identifies the target phone number on its network platform.

### Step 2: SIP Gateway Resource Lookup
Within the SignalWire Cloud Dashboard/API, the phone number is mapped to a **SIP Gateway Resource** (e.g. `cloudflare.signalwire.com`, Resource ID `09f4ed07-2a00-4cd9-84fd-ad6340043177`).

The SIP Gateway contains a routing rule that instructs SignalWire to perform **SIP Forwarding / Direct Trunking**:
* **Destination URI:** `sip:+16073654321@sip.voice.x.ai;transport=tls`
* **Transport Protocol:** TLS (Transport Layer Security) encrypts all SIP signaling header metadata.

### Step 3: SIP INVITE & Media Negotiation (SDP)
SignalWire constructs a standard SIP `INVITE` request:
1. **Header Identification:** Sets the `To:` header to `sip:+16073654321@sip.voice.x.ai` and includes caller ID info in the `From:` header.
2. **SDP (Session Description Protocol):** SignalWire includes an SDP payload listing supported audio codecs (G.711u / PCMU, G.711a, OPUS) and IP/port pairs for real-time audio transport.
3. **xAI Handshake:** xAI receives the SIP `INVITE` via TLS, recognizes the `byo_trunk` number `+16073654321`, sends a SIP `200 OK` back to SignalWire, and opens an RTP media socket.

### Step 4: Direct RTP Media Streaming
Once the SIP handshake completes, a direct bi-directional **RTP (Real-time Transport Protocol)** stream is established between SignalWire's media relay servers and xAI's voice servers.
* **Audio Bytes Flow:** Caller Phone <---> PSTN <---> SignalWire Media Edge <---> xAI Audio Pipeline.
* **Cloudflare Isolation:** Cloudflare Workers and Durable Objects **never** touch RTP audio frames. They only handle JSON control signals over a WebSocket connected to xAI.

---

## 4. Why SignalWire was Chosen over Twilio or Telnyx

1. **Native BYO-Trunk Compatibility:** SignalWire allows seamless direct SIP forwarding to arbitrary third-party TLS SIP endpoints (such as xAI's `sip.voice.x.ai`) without requiring complex TwiML or proprietary webhook middleware just to answer the call.
2. **Zero Ingest Latency:** SignalWire forwards the SIP packet at the network layer rather than executing application code or HTTP webhooks on the telephony side, keeping voice setup latency minimal (~50-150ms).
3. **Independent Phone Number Ownership:** Because SignalWire handles the phone number and xAI receives calls via webhook, switching which Cloudflare Worker or backend service "owns" the phone call requires zero changes on SignalWire. You simply re-register the webhook URL inside xAI's console.

---

## 5. Outbound Calling Architecture (Future Extension)

While Dial-a-Repo currently handles inbound calls, SignalWire can also initiate **outbound calls** using its Compatibility API or cURL requests:

```
+--------------------------+   1. POST /v2/laml/calls   +-----------------------+
| Cloudflare Worker        | -------------------------> | SignalWire REST API   |
+--------------------------+                            +-----------------------+
                                                                    |
                                                     2. Dials target phone number
                                                                    v
                                                        +-----------------------+
                                                        | Caller's Cellphone    |
                                                        +-----------------------+
                                                                    |
                                                     3. Bridges answered call
                                                                    v
                                                        +-----------------------+
                                                        | xAI SIP Endpoint      |
                                                        +-----------------------+
```

1. **Triggering Outbound Call:** The Worker makes an HTTP `POST` to SignalWire's `Calls` API with the target caller's number and a LAML/TwIML instruction:
   ```xml
   <Response>
     <Dial>
       <Sip>sip:+16073654321@sip.voice.x.ai;transport=tls</Sip>
     </Dial>
   </Response>
   ```
2. **Bridging:** As soon as the recipient picks up the call, SignalWire bridges the audio directly into xAI's SIP endpoint, making it appear to xAI as a standard inbound call session.
