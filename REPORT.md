# 과제 8 제출 보고서: 내 소개 페이지에 패스키 달기

> **과제명**: T08 · 내 소개 페이지에 패스키 달기 — 비밀번호 없이 나만 들어가기  
> **제출자**: 한승윤 (Regista)  
> **소스 저장소 URL**: [https://github.com/mmmphyun/aleph-01-introduction](https://github.com/mmmphyun/aleph-01-introduction)  
> **결과물 배포 URL**: [https://aleph-01-introduction.vercel.app](https://aleph-01-introduction.vercel.app) (또는 `http://localhost:3000`)  
> ※ 본 과제의 모든 비공개 데이터는 테스트용 가상 데이터이며, 실제 개인 식별 정보(주민등록번호, 전화번호, 실주소 등)는 일체 포함되어 있지 않습니다.

---

## 1. 짧은 확인 방법 (4줄)

- **어디로 가나요**: 결과물 배포 URL(또는 로컬 `http://localhost:3000`) 접속 후 화면 하단의 `Locker Room Private Vault` 섹션으로 이동합니다.
- **세 단계 안에 무엇을 하나요**:
  1. 접근 계정을 `한승윤 (regista_master)`으로 선택하고 기기명을 입력한 뒤 `패스키 등록` 버튼을 눌러 기기 생체인증/보안키를 등록합니다.
  2. `로그아웃`을 누른 후, 동일 계정 선택 상태에서 `패스키로 잠금해제` 버튼을 눌러 패스키 로그인을 수행합니다.
  3. 언락된 화면에서 등록된 패스키 목록 중 하나를 `삭제`한 후에도 정상 접근되는지 확인합니다.
- **무엇이 보이면 통과인가요**: 상단 배지가 `UNLOCKED · 열림`으로 바뀌며, 미인증 상태에서는 볼 수 없던 비공개 연구 노트 3종(StatsBomb DB 스키마 초안, DevSecOps 타깃 분석, 파이프라인 동시성 복기)과 등록된 패스키 관리 목록이 화면에 렌더링됩니다.
- **안 될 때는 무엇이 보이나요**: 배지가 `LOCKED · 잠김` 상태를 유지하고 자물쇠 아이콘과 함께 "비공개 전술실이 잠겨 있습니다. 등록된 패스키로 기기 생체인증 또는 보안키 서명을 완료해야 서버에서 비공개 연구 노트를 안전하게 수신합니다." 문구가 표시되며, 하단 피드백 영역에 붉은색 오류 안내 메시지가 출력됩니다.

---

## 2. AI와 내 판단 (3줄)

- **AI에게 맡긴 일**: W3C WebAuthn Level 3 규격에 부합하는 `@simplewebauthn` 기반 챌린지 생성, COSE 공개키 디코딩 및 ASN.1 DER 서명 검증 보일러플레이트 코드 작성.
- **내가 직접 판단한 일**: Ponytail 원칙을 적용해 복잡한 DB/ORM(Prisma, SQLite)과 컨트롤러 레이어를 걷어내고, 서버 메모리 기반 단일 파일(`server.mjs`) 및 가상 인증자 기반 20개 전수 자동 검증기(`scripts/verify.mjs`)로 구조를 극대화하여 단순화함.
- **AI 말을 따르지 않은 일(이유)**: AI가 초기에 제안한 JWT 로컬스토리지 저장 방식 및 클라이언트 사이드 숨김(CSS `display:none`) 제안을 거절함. XSS 탈취 위협을 원천 차단하기 위해 `HttpOnly` 세션 쿠키 방식을 채택하고, 미인증 시 서버 API에서 401로 원천 차단하여 HTML 소스상에 비공개 텍스트가 1글자도 포함되지 않도록 직접 변경함.

---

## 3. 인증 구현 설명서 (여섯 항목)

### ① 무엇으로 붙였나
- **사용 라이브러리**:
  - 백엔드: `@simplewebauthn/server` (v14.0.3)
  - 프론트엔드: `@simplewebauthn/browser` (v14.0.0, 로컬 번들 및 CDN fallback)
  - 서버 프레임워크: Node.js `express` (v5.3.0) + `express-session` (v1.19.0)
- 별도의 서드파티 인증 SaaS(Auth0, Firebase 등)나 비밀번호 해시 알고리즘(bcrypt)에 의존하지 않고, W3C WebAuthn 표준 라이브러리를 직접 서버에 통합 구현했습니다.

### ② 왜 그걸 골랐나
1. **W3C FIDO2 / WebAuthn Level 3 완벽 준수**: 공개키 암호화(COSE 포맷, ES256/P-256 알고리즘), AuthenticatorData 파싱, ClientDataJSON 해시 검증을 표준에 맞게 완벽 지원.
2. **비밀번호 전면 배제 (Passwordless)**: 사용자 비밀번호를 서버에 저장하거나 입력받지 않고, 기기 하드웨어 보안 영역(TPM, Secure Enclave, YubiKey)의 개인키 서명만으로 인증 수행.
3. **경량화 및 플랫폼 독립성**: 단일 Node.js 프로세스 내에서 정적 파일 서빙과 WebAuthn REST 엔드포인트를 의존성 최소화(`// ponytail` 지향)로 구동 가능.

### ③ 어디를 어떻게 고쳤나 (4대 핵심 흐름 소스 위치)

1. **등록 흐름 (WebAuthn Registration)**:
   - [server.mjs L89-L162](file:///c:/work/aleph-01-introduction/server.mjs#L89-L162): `POST /api/auth/register-options`에서 일회용 `challenge`를 발급해 세션에 저장하고, `POST /api/auth/register-verify`에서 브라우저가 보낸 attestation 서명을 검증한 뒤 공개키(`credential.publicKey`, COSE base64url)를 메모리에 저장.
   - [main.js L493-L545](file:///c:/work/aleph-01-introduction/main.js#L493-L545): `btnRegister` 클릭 시 `SimpleWebAuthnBrowser.startRegistration()`을 호출하여 기기 인증 팝업 연동 및 등록 취소 예외(`NotAllowedError`) 안내 처리.

2. **로그인 흐름 (WebAuthn Authentication)**:
   - [server.mjs L164-L238](file:///c:/work/aleph-01-introduction/server.mjs#L164-L238): `POST /api/auth/login-options`에서 신규 챌린지를 발행하고, `POST /api/auth/login-verify`에서 저장된 공개키로 기기의 서명(`signature`)과 카운터를 검증한 뒤 세션(`req.session.userId`) 수립. 챌린지는 검증 전 즉시 null로 소모해 재사용 방지.
   - [main.js L547-L596](file:///c:/work/aleph-01-introduction/main.js#L547-L596): `btnLogin` 클릭 시 `SimpleWebAuthnBrowser.startAuthentication()`을 호출해 생체인증 후 결과 서버 전송.

3. **로그아웃 흐름 (Session Destruction)**:
   - [server.mjs L269-L275](file:///c:/work/aleph-01-introduction/server.mjs#L269-L275): `POST /api/auth/logout`에서 `req.session.destroy()` 및 `connect.sid` 쿠키 초기화.
   - [main.js L598-L606](file:///c:/work/aleph-01-introduction/main.js#L598-L606): 로그아웃 버튼 클릭 시 UI를 즉시 `LOCKED` 플레이스홀더로 전환하고 메모리 내 데이터 파기.

4. **비공개 자료 조회 흐름 (Vault Access Control)**:
   - [server.mjs L277-L308](file:///c:/work/aleph-01-introduction/server.mjs#L277-L308): `GET /api/vault` 호출 시 세션 부재 시 401 거절. `GET /api/vault/:targetUserId` 호출 시 세션 소유자와 대상 ID가 다르면 403 Forbidden 거절.
   - [main.js L457-L483](file:///c:/work/aleph-01-introduction/main.js#L457-L483): 인증 성공 후에만 fetch하여 동적으로 카드를 렌더링. 미인증 상태로 받은 HTML 페이지 소스에는 비공개 텍스트가 0글자도 존재하지 않음.

---

### ④ 안 열리는 것을 확인한 기록 (4가지 검증 대조 로그)

#### 1) 미인증 상태로 비공개 주소 열기 (성공 vs 실패 대조)
- **실패 요청 (미인증)**:
  ```http
  GET /api/vault HTTP/1.1
  Host: localhost:3000

  HTTP/1.1 401 Unauthorized
  Content-Type: application/json
  {"error":"인증 필요: 패스키로 로그인해야 비공개 자료를 열람할 수 있습니다."}
  ```
- **성공 요청 (패스키 인증 완료 후 세션 쿠키 첨부)**:
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
      {"id":"vault-1","category":"비공개 프로젝트 메모","title":"StatsBomb 시계열 전술 분석 엔진 DB 스키마 초안",...},
      {"id":"vault-2","category":"지원 목표 기업 목록","title":"2026 하반기 DevSecOps 직무 타깃 분석 노트",...},
      {"id":"vault-3","category":"엔지니어링 회고록","title":"마인크래프트 온보딩 파이프라인 동시성 병목 복기",...}
    ]
  }
  ```

#### 2) 남의 패스키/세션으로 열기 (상호 침범 거절 대조)
- **계정 A(`regista_master`) 세션으로 계정 B(`scout_guest`) 비공개 자료 요청**:
  ```http
  GET /api/vault/scout_guest HTTP/1.1
  Cookie: connect.sid=s%3A_userA_...[MASKED]

  HTTP/1.1 403 Forbidden
  Content-Type: application/json
  {"error":"접근 거부: 다른 계정의 비공개 자료에 접근할 권한이 없습니다.","requester":"regista_master","target":"scout_guest"}
  ```
- **계정 B(`scout_guest`) 세션으로 계정 A(`regista_master`) 비공개 자료 요청**:
  ```http
  GET /api/vault/regista_master HTTP/1.1
  Cookie: connect.sid=s%3A_userB_...[MASKED]

  HTTP/1.1 403 Forbidden
  Content-Type: application/json
  {"error":"접근 거부: 다른 계정의 비공개 자료에 접근할 권한이 없습니다.","requester":"scout_guest","target":"regista_master"}
  ```
- **침범 시도 전후 건수 불변**: 거절 전 `scout_guest` 비공개 항목 3건 → 침범 시도 후 3건 유지 (데이터 무결성 검증 통과).

#### 3) 이미 쓴 챌린지 재사용 (Replay Attack 방어 대조)
- **정상 서명 로그인 성공**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_123...","response":{"signature":"MEQCIC...[VALID]"}}

  HTTP/1.1 200 OK
  {"verified":true,"user":{"username":"regista_master","displayName":"한승윤 (Regista)"}}
  ```
- **동일 챌린지 및 서명으로 즉시 재요청 (Replay)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_123...","response":{"signature":"MEQCIC...[REPLAY]"}}

  HTTP/1.1 400 Bad Request
  Content-Type: application/json
  {"error":"로그인 챌린지가 없거나 이미 사용되었습니다."}
  ```

#### 4) 패스키 2개 등록 후 1개 삭제 뒤 로그인 (잔여 키 vs 삭제된 키 대조)
- **한 계정에 2개 등록**: `MacBook TouchID` 및 `YubiKey 5C` 등록 완료 (조회 건수: 2개).
- **1개 삭제 수행**: `DELETE /api/auth/credentials/cred_macbook_id` → 응답: `{"deleted":true,"remainingCount":1}`.
- **삭제된 패스키로 로그인 시도 (실패)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_macbook_id", ...}

  HTTP/1.1 401 Unauthorized
  {"error":"등록되지 않았거나 이미 삭제된 패스키입니다."}
  ```
- **남은 패스키(`YubiKey 5C`)로 로그인 시도 (성공)**:
  ```http
  POST /api/auth/login-verify HTTP/1.1
  {"id":"cred_yubikey_id", ...}

  HTTP/1.1 200 OK
  {"verified":true,"user":{"username":"regista_master","displayName":"한승윤 (Regista)"}}
  ```

---

### ⑤ AI와 나
- **AI에게 맡긴 일**: WebAuthn 명세에 맞춘 CBOR/COSE 구조체 디코딩, DER 서명 검증 유틸 함수 작성 및 테스트 스위트 구조화.
- **내가 직접 판단한 일**: 미인증 시점의 HTML 소스 검사를 수동으로 수행하여 비공개 정보 노출 여부를 점검하고, 클라이언트 display:none 방식 대신 서버 측 401 API 지연 로딩 패턴을 확립함.
- **AI 말을 따르지 않은 일(이유)**: AI가 제안한 패스키 복구용 백업 이메일/보안 질문 방식을 배제함. 본 과제의 취지가 "비밀번호 없는 순수 패스키 시스템"이므로, 복구 메커니즘 역시 패스키 다중 등록(기기 분실 대비 2개 이상 등록) 방식으로 통일함.

---

### ⑥ 아직 못 막은 것 (구체적 위험 요소 2가지)
1. **인메모리 세션 스토어의 휘발성 및 단일 서버 종속성**:
   - 현재 구현은 Ponytail 원칙에 따라 별도 Redis/DB 없이 `server.mjs`의 메모리 Map과 express-session 인메모리 저장소에 의존합니다.
   - 서버 프로세스가 재기동되거나 다중 인스턴스(로드밸런서 환경)로 스케일아웃될 경우, 챌린지 세션 및 등록된 패스키가 소실되거나 세션 불일치가 발생할 수 있습니다. (운영 환경 승격 시 Redis 세션 클러스터 및 PostgreSQL 암호화 저장소 필요).
2. **클라이언트 브라우저 악성코드/XSS에 의한 활성 세션 하이재킹**:
   - WebAuthn은 로그인 시점의 자격증명 서명 위조 및 피싱을 완벽히 방어하지만, 인증 완료 후 발급된 세션 쿠키가 활성화된 상태에서 클라이언트 PC가 악성 프로세스에 감염될 경우 브라우저 레벨에서 API를 대리 호출하는 공격(Session Hijacking)은 방어하지 못합니다. (향후 mTLS 또는 WebAuthn 트랜잭션 단위 재서명 기법 도입 검토 필요).

---

## 4. 완주 체크리스트 검증 결과

- [x] **공개 영역과 비공개 영역을 화면에서 갈라 두었습니다**: 상단 전술판 소개 영역과 하단 `Locker Room Private Vault` 섹션으로 시각적 경계 명확화.
- [x] **패스키를 등록했고, 서버에 저장된 것이 공개키라는 것을 보였습니다**: 서버 `USERS_DB`의 `credentials[0].publicKey`에 COSE Base64URL 형식으로 보관되며 비밀번호가 아님을 입증.
- [x] **매번 새 질문이 오고, 이미 쓴 질문은 다시 통하지 않는 것을 확인했습니다**: 연속 2회 챌린지 상이함 검증 및 Replay 400 거절 확인.
- [x] **패스키를 두 개 등록해 하나를 지운 뒤에도 들어갔습니다**: `cred_1` 삭제 후 `cred_2`로 로그인 통과 및 삭제된 `cred_1` 거절 확인.
- [x] **남의 패스키로는 열리지 않는 것을 요청과 응답으로 남겼습니다**: 계정 A ↔ 계정 B 상호 접근 403 Forbidden 거절 및 건수 보존 입증.
- [x] **제출물 어디에도 실제 개인정보와 비밀값이 없습니다**: 허구의 엔지니어링 메모로 대체, 세션 쿠키 마스킹(`[MASKED]`) 준수, 비밀번호 칸 전면 배제.
