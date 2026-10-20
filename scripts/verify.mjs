process.env.NODE_ENV = 'test';
import crypto from 'crypto';
import http from 'http';
import app, { USERS_DB } from '../server.mjs';
import { isoCBOR, isoBase64URL } from '@simplewebauthn/server/helpers';

// 테스트 전용 서버 기동 (포트 3999)
const PORT = 3999;
const server = http.createServer(app);

// 쿠키 세션 보관용 헬퍼
class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = '';
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.cookies ? { Cookie: this.cookies } : {}),
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      ...options,
      headers
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      // connect.sid 쿠키 저장
      const sid = setCookie.split(';')[0];
      this.cookies = sid;
    }

    let body;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return {
      status: res.status,
      headers: res.headers,
      body
    };
  }
}

// 가상 WebAuthn 인증자 (Virtual Authenticator: P-256 ES256)
function createVirtualAuthenticator(rpId = 'localhost') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const credentialId = crypto.randomBytes(16);
  let signCount = 0;

  // JWK 추출하여 COSE 공개키 맵 생성
  const jwk = publicKey.export({ format: 'jwk' });
  const xBuf = isoBase64URL.toBuffer(jwk.x);
  const yBuf = isoBase64URL.toBuffer(jwk.y);

  const coseKeyMap = new Map();
  coseKeyMap.set(1, 2);   // kty: 2 (EC2)
  coseKeyMap.set(3, -7);  // alg: -7 (ES256)
  coseKeyMap.set(-1, 1);  // crv: 1 (P-256)
  coseKeyMap.set(-2, xBuf);
  coseKeyMap.set(-3, yBuf);
  const coseKeyBytes = isoCBOR.encode(coseKeyMap);

  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();

  return {
    credentialId,
    credentialIdBase64URL: isoBase64URL.fromBuffer(credentialId),
    privateKey,
    publicKey,

    // 등록 응답 생성 (Attestation)
    createAttestationResponse(challenge, origin = `http://localhost:${PORT}`) {
      const clientDataObj = {
        type: 'webauthn.create',
        challenge,
        origin,
        crossOrigin: false
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj));
      const clientDataJSONBase64 = isoBase64URL.fromBuffer(clientDataJSON);

      // authData 조립: rpIdHash (32) + flags (1, 0x45 = UP|UV|AT) + signCount (4) + aaguid (16) + credIdLen (2) + credId (16) + coseKey
      const flags = Buffer.from([0x45]);
      const signCountBuf = Buffer.alloc(4);
      signCountBuf.writeUInt32BE(signCount, 0);
      const aaguid = Buffer.alloc(16); // 16 zeros
      const credIdLen = Buffer.alloc(2);
      credIdLen.writeUInt16BE(credentialId.length, 0);

      const authData = Buffer.concat([
        rpIdHash,
        flags,
        signCountBuf,
        aaguid,
        credIdLen,
        credentialId,
        coseKeyBytes
      ]);

      const attStmtMap = new Map();
      const attestationMap = new Map();
      attestationMap.set('fmt', 'none');
      attestationMap.set('attStmt', attStmtMap);
      attestationMap.set('authData', authData);

      const attestationObject = isoCBOR.encode(attestationMap);
      const attestationObjectBase64 = isoBase64URL.fromBuffer(attestationObject);

      return {
        id: isoBase64URL.fromBuffer(credentialId),
        rawId: isoBase64URL.fromBuffer(credentialId),
        response: {
          clientDataJSON: clientDataJSONBase64,
          attestationObject: attestationObjectBase64,
          transports: ['internal']
        },
        type: 'public-key',
        clientExtensionResults: {}
      };
    },

    // 인증 응답 생성 (Assertion)
    createAssertionResponse(challenge, origin = `http://localhost:${PORT}`, tamperSignature = false) {
      signCount += 1;
      const clientDataObj = {
        type: 'webauthn.get',
        challenge,
        origin,
        crossOrigin: false
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj));
      const clientDataJSONBase64 = isoBase64URL.fromBuffer(clientDataJSON);

      const flags = Buffer.from([0x05]); // UP | UV
      const signCountBuf = Buffer.alloc(4);
      signCountBuf.writeUInt32BE(signCount, 0);

      const authData = Buffer.concat([
        rpIdHash,
        flags,
        signCountBuf
      ]);
      const authDataBase64 = isoBase64URL.fromBuffer(authData);

      // 서명 대상: authData + SHA-256(clientDataJSON)
      const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
      const signatureTarget = Buffer.concat([authData, clientDataHash]);

      let sig = crypto.sign('sha256', signatureTarget, {
        key: privateKey,
        dsaEncoding: 'der'
      });

      if (tamperSignature) {
        // 서명 1바이트 변조 (위조 서명)
        const tampered = Buffer.from(sig);
        tampered[tampered.length - 1] ^= 0xff;
        sig = tampered;
      }

      return {
        id: isoBase64URL.fromBuffer(credentialId),
        rawId: isoBase64URL.fromBuffer(credentialId),
        response: {
          authenticatorData: authDataBase64,
          clientDataJSON: clientDataJSONBase64,
          signature: isoBase64URL.fromBuffer(sig),
          userHandle: ''
        },
        type: 'public-key',
        clientExtensionResults: {}
      };
    }
  };
}

// 마스킹 헬퍼
function maskValue(val) {
  if (!val) return 'none';
  if (val.length <= 10) return '***';
  return `${val.slice(0, 6)}...[MASKED]...${val.slice(-4)}`;
}

async function runVerification() {
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`[VERIFY] Test server running on port ${PORT}\n`);

  const results = [];
  function assert(condition, testId, desc, details = '') {
    if (condition) {
      console.log(`PASS [${testId}] ${desc}`);
      results.push({ testId, desc, pass: true, details });
    } else {
      console.error(`FAIL [${testId}] ${desc} - Details: ${details}`);
      results.push({ testId, desc, pass: false, details });
    }
  }

  try {
    const clientA = new TestClient(`http://localhost:${PORT}`);
    const clientB = new TestClient(`http://localhost:${PORT}`);

    // =========================================================================
    // 1. 미인증 접근 시 401/403 거절 (T08-C15, T08-C16, T08-C17)
    // =========================================================================
    const unauthVault = await clientA.request('/api/vault');
    assert(
      unauthVault.status === 401 && unauthVault.body.error.includes('인증 필요'),
      'T08-C16,C17',
      '패스키 미인증 상태에서 비공개 자료 직접 요청 시 401 거절',
      `Status: ${unauthVault.status}, Body: ${JSON.stringify(unauthVault.body)}`
    );

    // =========================================================================
    // 2. 등록 챌린지 생성 및 매번 상이함 확인 (T08-C19, T08-C20)
    // =========================================================================
    const regOpt1 = await clientA.request('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master', deviceName: 'MacBook TouchID' })
    });
    const regOpt2 = await clientA.request('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master', deviceName: 'MacBook TouchID' })
    });
    assert(
      regOpt1.body.challenge && regOpt2.body.challenge && regOpt1.body.challenge !== regOpt2.body.challenge,
      'T08-C19,C20',
      '서버가 등록용 일회용 챌린지를 생성하며 매 요청마다 값이 다름',
      `Opt1 Challenge: ${regOpt1.body.challenge}, Opt2 Challenge: ${regOpt2.body.challenge}`
    );

    // =========================================================================
    // 3. 패스키 1 등록 성공 및 공개키 저장, 개인키 미전송 확인 (T08-C21, C22, C23, C24)
    // =========================================================================
    const authA1 = createVirtualAuthenticator('localhost');
    const attestationRespA1 = authA1.createAttestationResponse(regOpt2.body.challenge);

    // 페이로드에 개인키가 포함되어 있지 않음을 확인 (T08-C23)
    const payloadStr = JSON.stringify(attestationRespA1);
    const hasPrivateKey = payloadStr.includes('privateKey') || payloadStr.includes('dsa') || payloadStr.includes('priv');
    assert(!hasPrivateKey, 'T08-C23', '등록 요청 페이로드에 개인키가 포함되지 않고 클라이언트 기기에만 유지됨');

    const regVerify1 = await clientA.request('/api/auth/register-verify', {
      method: 'POST',
      body: JSON.stringify(attestationRespA1)
    });
    assert(
      regVerify1.status === 200 && regVerify1.body.verified === true,
      'T08-C21,C24',
      '첫 번째 패스키 등록 성공 및 Friendly Name 부착',
      `Device: ${regVerify1.body.credential.deviceName}, Id: ${regVerify1.body.credential.id}`
    );

    const savedCred1 = USERS_DB.regista_master.credentials[0];
    assert(
      savedCred1 && savedCred1.publicKey && !savedCred1.password,
      'T08-C21,C22',
      '서버에 저장된 값은 공개키(COSE base64url)이며 비밀번호가 아님',
      `PublicKey: ${savedCred1.publicKey.slice(0, 30)}...`
    );

    // =========================================================================
    // 4. 패스키 2 등록 (한 계정에 패스키 2개 등록 - T08-C42, C43)
    // =========================================================================
    const regOptA2 = await clientA.request('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master', deviceName: 'YubiKey 5C' })
    });
    const authA2 = createVirtualAuthenticator('localhost');
    const attestationRespA2 = authA2.createAttestationResponse(regOptA2.body.challenge);
    const regVerify2 = await clientA.request('/api/auth/register-verify', {
      method: 'POST',
      body: JSON.stringify(attestationRespA2)
    });

    const credList = await clientA.request('/api/auth/credentials');
    assert(
      credList.status === 200 && credList.body.length === 2,
      'T08-C42,C43',
      '한 계정에 패스키 2개 등록 완료 및 목록 화면에서 확인 가능',
      `Registered Keys: ${credList.body.map(c => c.deviceName).join(', ')}`
    );

    // =========================================================================
    // 5. 로그인 챌린지 생성 및 매 요청마다 상이함 확인 (T08-C27, T08-C28)
    // =========================================================================
    const loginOpt1 = await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    const loginOpt2 = await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    assert(
      loginOpt1.body.challenge && loginOpt2.body.challenge && loginOpt1.body.challenge !== loginOpt2.body.challenge,
      'T08-C27,C28',
      '로그인 시 매번 새로운 챌린지를 발행하며 이전 값과 다름',
      `Login Challenge 1: ${loginOpt1.body.challenge}, Login Challenge 2: ${loginOpt2.body.challenge}`
    );

    // =========================================================================
    // 6. 서명 검증 성공 vs 실패 대조 (T08-C29, T08-C30)
    // =========================================================================
    // 6-1: 실패 요청 (위조 서명)
    const tamperedAssertion = authA1.createAssertionResponse(loginOpt2.body.challenge, `http://localhost:${PORT}`, true);
    // 검증을 위해 동일 챌린지 옵션을 다시 세팅
    await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    const failResp = await clientA.request('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify(tamperedAssertion)
    });
    assert(
      failResp.status === 401,
      'T08-C30(실패)',
      '위조된 서명으로 로그인 요청 시 401 Unauthorized 거절',
      `Status: ${failResp.status}, Error: ${failResp.body.error}`
    );

    // 6-2: 성공 요청 (정상 서명)
    const validLoginOpt = await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    const validAssertion = authA1.createAssertionResponse(validLoginOpt.body.challenge, `http://localhost:${PORT}`, false);
    const successResp = await clientA.request('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify(validAssertion)
    });
    assert(
      successResp.status === 200 && successResp.body.verified === true,
      'T08-C29,C30(성공)',
      '정상 공개키 서명 검증 성공 및 로그인 통과',
      `Verified User: ${successResp.body.user.displayName}`
    );

    // =========================================================================
    // 7. 기사용 챌린지 재사용(Replay Attack) 거절 검증 (T08-C31)
    // =========================================================================
    const replayResp = await clientA.request('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify(validAssertion)
    });
    assert(
      replayResp.status === 400 && replayResp.body.error.includes('이미 사용'),
      'T08-C31',
      '이미 사용된 챌린지로 다시 로그인 시도 시 즉시 거절(Replay Attack 방어)',
      `Status: ${replayResp.status}, Body: ${JSON.stringify(replayResp.body)}`
    );

    // =========================================================================
    // 8. 세션 쿠키 발급 및 비공개 데이터 3개 열람 확인 (T08-C14, C32, C34)
    // =========================================================================
    const authVault = await clientA.request('/api/vault');
    assert(
      authVault.status === 200 && authVault.body.vault.length >= 3,
      'T08-C14,C32',
      '로그인 세션 기반으로 비공개 영역 3개 항목 정상 열람',
      `Items count: ${authVault.body.vault.length}, Session Cookie: ${maskValue(clientA.cookies)}`
    );

    // =========================================================================
    // 9. 계정 2 (`scout_guest`) 등록 및 격리 검증 (T08-C36, C37, C38, C39, C40, C41)
    // =========================================================================
    const regOptB = await clientB.request('/api/auth/register-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'scout_guest', deviceName: 'Android Pixel' })
    });
    const authB1 = createVirtualAuthenticator('localhost');
    const attestationRespB1 = authB1.createAttestationResponse(regOptB.body.challenge);
    await clientB.request('/api/auth/register-verify', {
      method: 'POST',
      body: JSON.stringify(attestationRespB1)
    });

    const vaultCountBefore = USERS_DB.scout_guest.vault.length;

    // 9-1: 계정 A 세션으로 계정 B 자료 열람 시도 (T08-C37)
    const attackAtoB = await clientA.request('/api/vault/scout_guest');
    assert(
      attackAtoB.status === 403,
      'T08-C37',
      '계정 A의 세션으로 계정 B의 비공개 자료 요청 시 403 Forbidden 거절',
      `Status: ${attackAtoB.status}, Error: ${attackAtoB.body.error}`
    );

    // 9-2: 계정 B 세션으로 계정 A 자료 열람 시도 (T08-C38)
    const attackBtoA = await clientB.request('/api/vault/regista_master');
    assert(
      attackBtoA.status === 403,
      'T08-C38',
      '계정 B의 세션으로 계정 A의 비공개 자료 요청 시 403 Forbidden 거절',
      `Status: ${attackBtoA.status}, Error: ${attackBtoA.body.error}`
    );

    // 9-3: 거절 전후 데이터 건수 동일 (T08-C39)
    const vaultCountAfter = USERS_DB.scout_guest.vault.length;
    assert(
      vaultCountBefore === vaultCountAfter,
      'T08-C39',
      '침범 시도 전후 대상 계정의 비공개 자료 건수가 동일하게 보존됨',
      `Before: ${vaultCountBefore}, After: ${vaultCountAfter}`
    );

    // 9-4: URL 변조 IDOR 시도 시 거절 (T08-C40)
    assert(
      attackAtoB.body.requester === 'regista_master' && attackAtoB.body.target === 'scout_guest',
      'T08-C40,C41',
      '파라미터 변조(IDOR) 시 서버 세션 주체 불일치로 엄격 차단 (server.mjs L261-L267)'
    );

    // =========================================================================
    // 10. 패스키 1개 삭제 후 남은 하나로 로그인 성공 (T08-C44, C45)
    // =========================================================================
    const credToDelete = credList.body[0].id;
    const credRemaining = credList.body[1].id;

    const delResp = await clientA.request(`/api/auth/credentials/${credToDelete}`, {
      method: 'DELETE'
    });
    assert(
      delResp.status === 200 && delResp.body.deleted === true && delResp.body.remainingCount === 1,
      'T08-C44(삭제)',
      '첫 번째 패스키 삭제 성공, 잔여 패스키 1개 남음'
    );

    // 삭제된 패스키로 로그인 시도 -> 401 거절 (T08-C45)
    const loginOptAfterDel = await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    const deletedKeyAssertion = authA1.createAssertionResponse(loginOptAfterDel.body.challenge);
    const delKeyLoginResp = await clientA.request('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify(deletedKeyAssertion)
    });
    assert(
      delKeyLoginResp.status === 401 && delKeyLoginResp.body.error.includes('삭제된'),
      'T08-C45',
      '삭제된 패스키로 로그인 시도 시 401 거절',
      `Status: ${delKeyLoginResp.status}, Error: ${delKeyLoginResp.body.error}`
    );

    // 남은 패스키(authA2)로 로그인 시도 -> 성공 (T08-C44)
    const validLoginOptAfterDel = await clientA.request('/api/auth/login-options', {
      method: 'POST',
      body: JSON.stringify({ username: 'regista_master' })
    });
    const remainingKeyAssertion = authA2.createAssertionResponse(validLoginOptAfterDel.body.challenge);
    const remainingLoginResp = await clientA.request('/api/auth/login-verify', {
      method: 'POST',
      body: JSON.stringify(remainingKeyAssertion)
    });
    assert(
      remainingLoginResp.status === 200 && remainingLoginResp.body.verified === true,
      'T08-C44(성공)',
      '남은 패스키(YubiKey 5C)로 로그인 성공'
    );

    // =========================================================================
    // 11. 로그아웃 후 세션 재요청 거절 (T08-C33)
    // =========================================================================
    const logoutResp = await clientA.request('/api/auth/logout', { method: 'POST' });
    assert(logoutResp.status === 200, 'T08-C33(로그아웃)', '로그아웃 성공 및 세션 파기');

    const afterLogoutVault = await clientA.request('/api/vault');
    assert(
      afterLogoutVault.status === 401,
      'T08-C33(거절)',
      '로그아웃 후 동일 세션 쿠키로 비공개 데이터 재요청 시 401 거절'
    );

  } finally {
    server.close();
    console.log('\n[VERIFY] All test cases executed.');
  }

  const allPassed = results.every(r => r.pass);
  console.log(`\n==============================================`);
  console.log(`Verification Summary: ${results.filter(r => r.pass).length}/${results.length} PASSED`);
  console.log(`Status: ${allPassed ? 'ALL CRITERIA SATISFIED' : 'SOME TESTS FAILED'}`);
  console.log(`==============================================\n`);

  if (!allPassed) process.exit(1);
  process.exit(0);
}

runVerification().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
