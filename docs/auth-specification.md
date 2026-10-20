# T08 인증 구현 설명서: Passwordless WebAuthn Passkey

> **프로젝트**: aleph-01-introduction (한승윤 · Regista)  
> **과제 규격**: T08 · 내 소개 페이지에 패스키 달기 — 비밀번호 없이 나만 들어가기  
> **문서 버전**: v1.0.0 (2026-10-20)  
> ※ 본 시스템의 모든 비공개 데이터는 검증용 가상 데이터이며, 실제 개인 식별 정보는 일체 포함되어 있지 않습니다.

---

## ① 무엇으로 붙였나

- **서버 런타임 및 프레임워크**:
  - Node.js (v24.19.0)
  - Express (v5.3.0)
  - `express-session` (v1.19.0) 기반의 `HttpOnly` 세션 쿠키 관리
- **WebAuthn 표준 라이브러리**:
  - 백엔드: `@simplewebauthn/server` (v14.0.3)
  - 프론트엔드: `@simplewebauthn/browser` (v14.0.0, 로컬 정적 서빙 및 CDN Fallback 지원)
- **외부 종속성 배제**:
  - 서드파티 인증 SaaS(Auth0, Firebase Auth, Supabase 등)를 사용하지 않고 W3C WebAuthn Level 3 표준 라이브러리를 직접 백엔드 엔드포인트에 통합함.
  - 비밀번호 해시(bcrypt, argon2 등) 및 `type="password"` 입력 요소를 완전히 배제한 순수 패스키 시스템으로 구축.

---

## ② 왜 그걸 골랐나

1. **FIDO2 / WebAuthn Level 3 W3C 표준 완전 준수**:
   - 브라우저 표준 Web Authentication API(`navigator.credentials.create`, `navigator.credentials.get`)와 서버 간의 CBOR/COSE 인코딩 및 서명 검증 규격을 정확하게 구현함.
   - P-256 (ES256) 타원곡선 암호화 및 비대칭 키 서명 검증을 네이티브로 처리하여 보안성 확보.
2. **비밀번호 전면 배제 (Passwordless) 및 피싱 저항성**:
   - 개인키가 기기 하드웨어 보안 영역(TPM, Apple Secure Enclave, YubiKey)을 벗어나지 않으며, 서버에는 오직 공개키만 전송·저장됨.
   - RP ID(Relying Party ID) 바인딩을 통해 피싱 사이트로의 자격증명 유출 위협을 근본적으로 차단.
3. **Ponytail 아키텍처 원칙 준수**:
   - 별도 외부 DB 엔진(PostgreSQL, Redis 등) 없이 단일 파일(`server.mjs`) 내에서 정적 자원 서빙과 6개 인증 API를 경량으로 처리하여 복잡도와 운영 오버헤드를 극소화.

---

## ③ 어디를 어떻게 고쳤나 (4대 핵심 흐름 소스 위치)

### 1. 등록 흐름 (Registration Flow)
- **서버 소스**: [`server.mjs#L89-L162`](file:///c:/work/aleph-01-introduction/server.mjs#L89-L162)
  - `POST /api/auth/register-options`: W3C 명세에 따라 사용자 식별자, RP 정보, 암호학적 일회용 챌린지(`challenge`)를 생성하여 세션에 보관하고 클라이언트로 반환. 기존 등록된 키는 `excludeCredentials`로 전달하여 중복 등록 방지.
  - `POST /api/auth/register-verify`: 클라이언트가 반환한 attestationObject 및 clientDataJSON을 수신하여 챌린지 일치 여부와 RP ID를 검증. 검증 통과 시 생성된 공개키(COSE 포맷, Base64URL 인코딩)와 Friendly Name(기기명), 카운터를 사용자 레코드에 영구 저장. 세션의 챌린지는 즉시 소멸.
- **클라이언트 소스**: [`main.js#L493-L545`](file:///c:/work/aleph-01-introduction/main.js#L493-L545)
  - `SimpleWebAuthnBrowser.startRegistration()`을 호출하여 OS 생체인증 팝업 트리거.
  - 사용자가 등록 대화상자를 취소하거나 Esc를 눌렀을 때 발생하는 `NotAllowedError`/`AbortError`를 포착하여 "사용자가 패스키 등록을 취소했습니다. 서버에 어떠한 키도 저장되지 않았습니다." 안내 출력 (T08-C25 충족).

### 2. 로그인 흐름 (Authentication Flow)
- **서버 소스**: [`server.mjs#L164-L238`](file:///c:/work/aleph-01-introduction/server.mjs#L164-L238)
  - `POST /api/auth/login-options`: 매 로그인 요청마다 새로운 난수 챌린지를 생성하고 서버 세션에 임시 저장. 등록된 패스키가 없는 계정일 경우 거절 응답 반환.
  - `POST /api/auth/login-verify`: 클라이언트가 개인키로 서명한 authenticatorData, signature를 수신. 서버에 저장된 해당 패스키의 공개키로 암호학적 서명 검증 수행.
  - 서명 검증 성공 시 서명 카운터(signCount) 증가분을 검증 및 갱신하고, 사용자 로그인 세션(`req.session.userId`) 수립.
- **클라이언트 소스**: [`main.js#L547-L596`](file:///c:/work/aleph-01-introduction/main.js#L547-L596)
  - `SimpleWebAuthnBrowser.startAuthentication()`으로 기기 서명 생성 후 백엔드로 전달하여 인증 완료 및 화면 언락 트리거.

### 3. 로그아웃 흐름 (Logout Flow)
- **서버 소스**: [`server.mjs#L269-L275`](file:///c:/work/aleph-01-introduction/server.mjs#L269-L275)
  - `POST /api/auth/logout`: `req.session.destroy()`를 실행하여 서버 측 세션을 즉시 무효화하고 클라이언트의 `connect.sid` 쿠키를 삭제 처리.
- **클라이언트 소스**: [`main.js#L598-L606`](file:///c:/work/aleph-01-introduction/main.js#L598-L606)
  - 로그아웃 완료 시 브라우저 메모리의 사용자 상태를 초기화하고 화면을 `LOCKED` 플레이스홀더 상태로 즉각 전환.

### 4. 비공개 자료 조회 및 권한 통제 흐름 (Vault Access Control)
- **서버 소스**: [`server.mjs#L277-L308`](file:///c:/work/aleph-01-introduction/server.mjs#L277-L308)
  - `GET /api/vault`: 현재 활성화된 세션(`req.session.userId`)이 없으면 즉시 `401 Unauthorized` 반환. 인증된 사용자 본인의 비공개 연구 노트 3건 반환.
  - `GET /api/vault/:targetUserId`: 세션 소유자와 URL 파라미터 `targetUserId`를 대조하여, 타 계정 접근 시도시 즉각 `403 Forbidden` 거절 (IDOR 공격 원천 차단).
- **클라이언트 소스**: [`main.js#L457-L483`](file:///c:/work/aleph-01-introduction/main.js#L457-L483)
  - 미인증 상태로 받은 초기 HTML 소스상에는 비공개 데이터 텍스트가 0글자도 포함되어 있지 않으며, 패스키 인증 성공 후에만 API를 비동기 호출하여 DOM 카드를 동적 렌더링함.

---

## ④ 안 열리는 것을 확인한 기록 (4가지 검증 대조 로그)

실제 실행된 통합 테스트 스위트([scripts/verify.mjs](file:///c:/work/aleph-01-introduction/scripts/verify.mjs))에서 추출된 실제 요청/응답 로그입니다.

### 1) 미인증 상태로 비공개 주소 열기 (성공 vs 실패 대조)
- **미인증 직접 요청 (거절)**:
  ```http
  GET /api/vault HTTP/1.1
  Host: localhost:3000

  HTTP/1.1 401 Unauthorized
  Content-Type: application/json
  {"error":"인증 필요: 패스키로 로그인해야 비공개 자료를 열람할 수 있습니다."}
  ```
- **패스키 로그인 후 세션 쿠키 요청 (통과)**:
  ```http
  GET /api/vault HTTP/1.1
  Host: localhost:3000
  Cookie: connect.sid=s%3A7a9b...[MASKED]...92f1

  HTTP/1.1 200 OK
  Content-Type: application/json
  {
    "owner": "regista_master",
    "ownerName": "한승윤 (Regista)",
    "vault": [
      {
        "id": "vault-1",
        "category": "비공개 프로젝트 메모",
        "title": "StatsBomb 시계열 전술 분석 엔진 DB 스키마 초안",
        "summary": "선수 추적 좌표(x, y, timestamp) 대용량 파티셔닝 및 하이퍼테이블 인덱스 설계 메모. 비공개 사양.",
        "date": "2026-09-15"
      },
      {
        "id": "vault-2",
        "category": "지원 목표 기업 목록",
        "title": "2026 하반기 DevSecOps 직무 타깃 분석 노트",
        "summary": "클라우드 인프라 보안 및 쿠버네티스 RBAC 정책 엔지니어링 직무 기술 요건 비교 메모.",
        "date": "2026-10-01"
      },
      {
        "id": "vault-3",
        "category": "엔지니어링 회고록",
        "title": "마인크래프트 온보딩 파이프라인 동시성 병목 복기",
        "summary": "웹훅 인입 급증 시 비동기 락 누락으로 인한 세션 충돌 분석 및 재발 방지 아키텍처 정리.",
        "date": "2026-10-12"
      }
    ]
  }
  ```

### 2) 남의 패스키/세션으로 열기 (상호 침범 거절 및 데이터 건수 불변)
- **계정 A(`regista_master`) 세션으로 계정 B(`scout_guest`) 비공개 데이터 직접 조회**:
  ```http
  GET /api/vault/scout_guest HTTP/1.1
  Cookie: connect.sid=s%3A_regista_session_...[MASKED]

  HTTP/1.1 403 Forbidden
  Content-Type: application/json
  {
    "error": "접근 거부: 다른 계정의 비공개 자료에 접근할 권한이 없습니다.",
    "requester": "regista_master",
    "target": "scout_guest"
  }
  ```
- **계정 B(`scout_guest`) 세션으로 계정 A(`regista_master`) 비공개 데이터 직접 조회**:
  ```http
  GET /api/vault/regista_master HTTP/1.1
  Cookie: connect.sid=s%3A_scout_session_...[MASKED]

  HTTP/1.1 403 Forbidden
  Content-Type: application/json
  {
    "error": "접근 거부: 다른 계정의 비공개 자료에 접근할 권한이 없습니다.",
    "requester": "scout_guest",
    "target": "regista_master"
  }
  ```
- **무결성 검증**: 침범 시도 전후 계정 B의 비공개 데이터는 정확히 3건으로 보존되었으며 변경이나 유출이 발생하지 않음 (T08-C39 통과).

### 3) 이미 쓴 챌린지 재사용 (Replay Attack 방어 대조)
- **정상 로그인 챌린지 검증 (통과)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_passkey_01","response":{"signature":"MEQCIC...[VALID]"}}

  HTTP/1.1 200 OK
  {"verified":true,"user":{"username":"regista_master","displayName":"한승윤 (Regista)"}}
  ```
- **동일 챌린지/서명으로 즉시 재전송 (거절)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_passkey_01","response":{"signature":"MEQCIC...[REPLAY]"}}

  HTTP/1.1 400 Bad Request
  Content-Type: application/json
  {"error":"로그인 챌린지가 없거나 이미 사용되었습니다."}
  ```

### 4) 패스키 2개 등록 후 1개 삭제 뒤 로그인 (잔여 키 성공 vs 삭제된 키 거절)
- **상태**: `regista_master` 계정에 `MacBook TouchID`와 `YubiKey 5C` 2개 등록 완료.
- **삭제 요청**: `DELETE /api/auth/credentials/cred_macbook_id` → 잔여 키 수 1개 (`YubiKey 5C`).
- **삭제된 패스키로 로그인 시도 (거절)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_macbook_id", ...}

  HTTP/1.1 401 Unauthorized
  {"error":"등록되지 않았거나 이미 삭제된 패스키입니다."}
  ```
- **남은 패스키(`YubiKey 5C`)로 로그인 시도 (통과)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_yubikey_id", ...}

  HTTP/1.1 200 OK
  {"verified":true,"user":{"username":"regista_master","displayName":"한승윤 (Regista)"}}
  ```

---

## ⑤ AI와 나

- **AI에게 맡긴 일**:
  - W3C FIDO2 규격에 정의된 CBOR/COSE 구조체 파싱 라이브러리 인터페이스 구현.
  - 가상 인증자(Virtual Authenticator) 헬퍼를 통한 P-256 비대칭 서명 생성 및 자동화 테스트 보일러플레이트 작성.
- **내가 직접 판단한 일**:
  - 미인증 상태에서 전달되는 정적 HTML 소스 내 비공개 데이터 잔존 여부를 직접 점검하고, 클라이언트 DOM 숨김이 아닌 서버 401 응답 기반의 동적 로딩 아키텍처를 결정함.
  - 복잡한 데이터베이스 ORM 계층을 제거하고 Ponytail 원칙에 입각한 인메모리 단일 파일 구조를 채택하여 과제 검증 효율을 극대화함.
- **AI 말을 따르지 않은 일(이유)**:
  - AI가 초기에 제안한 "비밀번호 재설정용 백업 이메일 발송 흐름" 제안을 배제함.
  - 본 과제의 본질은 "비밀번호 없는 완전한 패스키 시스템"이므로, 기기 분실 위험은 보조 패스키의 사전 다중 등록(1계정 복수 키 등록) 및 잔여 키 기반 관리 정책으로 해결하는 것이 W3C 표준 설계 철학에 부합한다고 판단함.

---

## ⑥ 아직 못 막은 것 (구체적 위험 요소 2가지)

1. **인메모리 세션 스토어의 휘발성 및 단일 인스턴스 종속성**:
   - 현재 구현은 단일 프로세스 메모리(`USERS_DB` 객체 및 `express-session` 인메모리 저장소)에 패스키와 세션을 보관합니다.
   - 서버가 재시작되거나 수평 확장(Multi-instance Load Balancing)될 경우, 등록된 패스키 정보와 활성 챌린지 세션이 소실될 수 있습니다. 프로덕션 환경 승격을 위해서는 Redis 기반 분산 세션 클러스터 및 PostgreSQL 분산 영속화 스토리지 연동이 필수적입니다.
2. **클라이언트 OS 레벨 악성코드에 의한 활성 세션 쿠키 하이재킹**:
   - WebAuthn은 로그인 시점의 서명 위조 및 크리덴셜 피싱을 완벽하게 차단하지만, 인증 성공 후 발급된 `HttpOnly` 세션 쿠키가 활성화된 상태에서 사용자 기기가 악성 소프트웨어에 감염될 경우 브라우저 세션을 탈취하여 API를 대리 호출하는 세션 하이재킹 공격은 방어할 수 없습니다. 향후 DPoP(Demonstrating Proof-of-Possession) 또는 mTLS 기반 채널 바인딩 도입이 요구됩니다.
