import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ponytail: in-memory user store. Replace with persistent DB when server restart survival is needed.
const USERS_DB = {
  regista_master: {
    id: 'usr_regista_master',
    username: 'regista_master',
    displayName: '한승윤 (Regista)',
    credentials: [], // { id, publicKey: base64url, counter, deviceName, createdAt }
    vault: [
      {
        id: 'vault-1',
        category: '비공개 프로젝트 메모',
        title: 'StatsBomb 시계열 전술 분석 엔진 DB 스키마 초안',
        summary: '선수 추적 좌표(x, y, timestamp) 대용량 파티셔닝 및 하이퍼테이블 인덱스 설계 메모. 비공개 사양.',
        date: '2026-09-15'
      },
      {
        id: 'vault-2',
        category: '지원 목표 기업 목록',
        title: '2026 하반기 DevSecOps 직무 타깃 분석 노트',
        summary: '클라우드 인프라 보안 및 쿠버네티스 RBAC 정책 엔지니어링 직무 기술 요건 비교 메모.',
        date: '2026-10-01'
      },
      {
        id: 'vault-3',
        category: '엔지니어링 회고록',
        title: '마인크래프트 온보딩 파이프라인 동시성 병목 복기',
        summary: '웹훅 인입 급증 시 비동기 락 누락으로 인한 세션 충돌 분석 및 재발 방지 아키텍처 정리.',
        date: '2026-10-12'
      }
    ]
  },
  scout_guest: {
    id: 'usr_scout_guest',
    username: 'scout_guest',
    displayName: '게스트 스카우터 (Scout)',
    credentials: [],
    vault: [
      {
        id: 'vault-g1',
        category: '스카우팅 리포트',
        title: '2026 유망주 미드필더 전술 적합도 평가 메모',
        summary: '하프스페이스 전환 속도 및 압박 저항 지표 평가 내부 리포트.',
        date: '2026-10-05'
      },
      {
        id: 'vault-g2',
        category: '팀 빌딩 메모',
        title: '인프라 스터디 2기 커리큘럼 계획안',
        summary: 'Linux 커널 네트워킹과 eBPF 기반 보안 모니터링 실습 로드맵.',
        date: '2026-10-10'
      },
      {
        id: 'vault-g3',
        category: '코드 리뷰 체크리스트',
        title: 'WebAuthn 인증 흐름 점검 체크리스트',
        summary: 'FIDO2 Level 3 규격 챌린지 검증 및 RP ID 일치 여부 체크리스트.',
        date: '2026-10-18'
      }
    ]
  }
};

app.use(express.json());
// ponytail: static serving node_modules browser bundle for zero-bundler setup
app.use('/vendor/simplewebauthn-browser', express.static(path.join(__dirname, 'node_modules/@simplewebauthn/browser/dist/bundle')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.static(process.cwd()));

app.get('/', (req, res) => {
  const indexPath = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(process.cwd(), 'index.html')
  ].find(p => fs.existsSync(p));
  if (indexPath) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found');
  }
});

// ponytail: hardcoded session secret for demo. Use process.env.SESSION_SECRET in production.
app.use(session({
  name: 'connect.sid',
  secret: 'regista-passkey-session-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2 // 2시간
  }
}));

// RP (Relying Party) 메타데이터 헬퍼
function getRPConfig(req) {
  const host = req.get('host') || 'localhost:3000';
  const hostname = host.split(':')[0];
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return {
    rpName: '한승윤 · Regista 포트폴리오',
    rpID: hostname,
    origin: `${protocol}://${host}`
  };
}

// 1. 등록 옵션 생성 (일회용 챌린지 발급)
app.post('/api/auth/register-options', async (req, res) => {
  const { username, deviceName } = req.body;
  const user = USERS_DB[username];
  if (!user) return res.status(404).json({ error: '존재하지 않는 사용자입니다.' });

  const { rpName, rpID } = getRPConfig(req);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(user.id),
    userName: user.username,
    userDisplayName: user.displayName,
    attestationType: 'none',
    excludeCredentials: user.credentials.map(c => ({
      id: c.id,
      transports: c.transports
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    }
  });

  // 챌린지 및 등록 컨텍스트를 세션에 보관
  req.session.currentChallenge = options.challenge;
  req.session.regUsername = username;
  req.session.regDeviceName = deviceName || '등록 기기';

  res.json(options);
});

// 2. 등록 응답 검증 및 공개키 저장
app.post('/api/auth/register-verify', async (req, res) => {
  const { regUsername, regDeviceName, currentChallenge } = req.session;
  if (!currentChallenge || !regUsername) {
    return res.status(400).json({ error: '등록 챌린지가 없거나 만료되었습니다.' });
  }

  const user = USERS_DB[regUsername];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  const { rpID, origin } = getRPConfig(req);

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false
    });

    // 챌린지 즉시 파기 (일회용 보장)
    req.session.currentChallenge = null;

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: '등록 검증 실패' });
    }

    const { credential } = verification.registrationInfo;
    const newCredential = {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports || [],
      deviceName: regDeviceName,
      createdAt: new Date().toISOString()
    };

    user.credentials.push(newCredential);
    req.session.userId = user.username;

    res.json({
      verified: true,
      credential: {
        id: newCredential.id,
        deviceName: newCredential.deviceName,
        createdAt: newCredential.createdAt
      }
    });
  } catch (err) {
    req.session.currentChallenge = null;
    res.status(400).json({ error: err.message });
  }
});

// 3. 로그인 옵션 생성 (일회용 챌린지 발급)
app.post('/api/auth/login-options', async (req, res) => {
  const { username } = req.body;
  const user = USERS_DB[username];
  if (!user) return res.status(404).json({ error: '존재하지 않는 사용자입니다.' });
  if (user.credentials.length === 0) {
    return res.status(400).json({ error: '등록된 패스키가 없습니다. 먼저 패스키를 등록하세요.' });
  }

  const { rpID } = getRPConfig(req);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: user.credentials.map(c => ({
      id: c.id,
      transports: c.transports
    })),
    userVerification: 'preferred'
  });

  req.session.currentChallenge = options.challenge;
  req.session.loginUsername = username;

  res.json(options);
});

// 4. 로그인 응답 검증 및 서명 확인
app.post('/api/auth/login-verify', async (req, res) => {
  const { loginUsername, currentChallenge } = req.session;

  // 기사용/미존재 챌린지 거절 (T08-C31)
  if (!currentChallenge || !loginUsername) {
    return res.status(400).json({ error: '로그인 챌린지가 없거나 이미 사용되었습니다.' });
  }

  const expectedChallenge = currentChallenge;
  // 서명 검증 전 즉시 챌린지 소모
  req.session.currentChallenge = null;

  const user = USERS_DB[loginUsername];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  const body = req.body;
  const cred = user.credentials.find(c => c.id === body.id);
  if (!cred) {
    return res.status(401).json({ error: '등록되지 않았거나 이미 삭제된 패스키입니다.' });
  }

  const { rpID, origin } = getRPConfig(req);

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: cred.transports
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      return res.status(401).json({ error: '패스키 서명 검증에 실패했습니다.' });
    }

    cred.counter = verification.authenticationInfo.newCounter;
    req.session.userId = user.username;

    res.json({
      verified: true,
      user: {
        username: user.username,
        displayName: user.displayName
      }
    });
  } catch (err) {
    res.status(401).json({ error: `서명 검증 오류: ${err.message}` });
  }
});

// 5. 현재 세션 상태 확인
app.get('/api/auth/session', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }
  const user = USERS_DB[req.session.userId];
  if (!user) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    user: {
      username: user.username,
      displayName: user.displayName
    }
  });
});

// 6. 패스키 목록 조회
app.get('/api/auth/credentials', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '인증이 필요합니다.' });
  const user = USERS_DB[req.session.userId];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  res.json(user.credentials.map(c => ({
    id: c.id,
    deviceName: c.deviceName,
    createdAt: c.createdAt
  })));
});

// 7. 패스키 단건 삭제
app.delete('/api/auth/credentials/:credId', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '인증이 필요합니다.' });
  const user = USERS_DB[req.session.userId];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  const initialCount = user.credentials.length;
  user.credentials = user.credentials.filter(c => c.id !== req.params.credId);

  res.json({
    deleted: user.credentials.length < initialCount,
    remainingCount: user.credentials.length
  });
});

// 8. 로그아웃
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: '로그아웃 실패' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// 9. 비공개 데이터 조회 (인증된 사용자 본인 데이터 반환 - T08-C16, C17)
app.get('/api/vault', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '인증 필요: 패스키로 로그인해야 비공개 자료를 열람할 수 있습니다.' });
  }
  const user = USERS_DB[req.session.userId];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({
    owner: user.username,
    ownerName: user.displayName,
    vault: user.vault
  });
});

// 10. 타인 데이터 조회 시도 (권한 격리 및 IDOR 방어 검증 - T08-C37, C38, C40, C41)
app.get('/api/vault/:targetUserId', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: '인증 필요: 패스키 로그인이 필요합니다.' });
  }
  const currentUserId = req.session.userId;
  const targetUserId = req.params.targetUserId;

  if (currentUserId !== targetUserId) {
    return res.status(403).json({
      error: '접근 거부: 다른 계정의 비공개 자료에 접근할 권한이 없습니다.',
      requester: currentUserId,
      target: targetUserId
    });
  }

  const user = USERS_DB[targetUserId];
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json({
    owner: user.username,
    ownerName: user.displayName,
    vault: user.vault
  });
});

// 서버 기동 (로컬 및 일반 서버 환경)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[Regista WebAuthn] Server listening on http://localhost:${PORT}`);
  });
}

export default app;
export { USERS_DB };
