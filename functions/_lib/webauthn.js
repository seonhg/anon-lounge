// 패스키(WebAuthn) 검증 — 외부 라이브러리 없이 Web Crypto만 사용
// 지원 알고리즘: ES256(-7, 대부분의 폰·노트북), RS256(-257, 일부 Windows Hello)

export function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
const equalBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- 아주 작은 CBOR 해석기 (attestationObject, COSE 키에 필요한 만큼) ---
export function decodeCbor(bytes) {
  let pos = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function readLen(info) {
    if (info < 24) return info;
    if (info === 24) return view.getUint8(pos++);
    if (info === 25) { const v = view.getUint16(pos); pos += 2; return v; }
    if (info === 26) { const v = view.getUint32(pos); pos += 4; return v; }
    if (info === 27) { const hi = view.getUint32(pos); const lo = view.getUint32(pos + 4); pos += 8; return hi * 2 ** 32 + lo; }
    throw new Error('CBOR: 지원하지 않는 길이');
  }
  function item() {
    const first = view.getUint8(pos++);
    const major = first >> 5;
    const info = first & 31;
    switch (major) {
      case 0: return readLen(info);
      case 1: return -1 - readLen(info);
      case 2: { const n = readLen(info); const v = bytes.slice(pos, pos + n); pos += n; return v; }
      case 3: { const n = readLen(info); const v = new TextDecoder().decode(bytes.slice(pos, pos + n)); pos += n; return v; }
      case 4: { const n = readLen(info); const arr = []; for (let i = 0; i < n; i++) arr.push(item()); return arr; }
      case 5: { const n = readLen(info); const m = new Map(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new Error('CBOR: 지원하지 않는 값');
      default: throw new Error('CBOR: 지원하지 않는 형식');
    }
  }
  const value = item();
  return { value, length: pos };
}

function parseAuthData(authData) {
  if (authData.length < 37) throw new Error('인증 데이터가 너무 짧아요.');
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const signCount = new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0);
  const out = { rpIdHash, flags, signCount, up: !!(flags & 0x01), uv: !!(flags & 0x04) };
  if (flags & 0x40) {
    let p = 37 + 16; // aaguid
    const idLen = (authData[p] << 8) | authData[p + 1];
    p += 2;
    out.credentialId = authData.slice(p, p + idLen);
    p += idLen;
    const { value, length } = decodeCbor(authData.slice(p));
    out.cose = value;
    out.coseLength = length;
  }
  return out;
}

function coseToJwk(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: bytesToB64url(cose.get(-2)), y: bytesToB64url(cose.get(-3)), ext: true } };
  }
  if (kty === 3 && alg === -257) {
    return { alg: -257, jwk: { kty: 'RSA', n: bytesToB64url(cose.get(-1)), e: bytesToB64url(cose.get(-2)), ext: true } };
  }
  throw new Error('이 기기의 패스키 방식은 아직 지원하지 않아요.');
}

function importKey(alg, jwk) {
  if (alg === -7) return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (alg === -257) return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  throw new Error('지원하지 않는 알고리즘');
}

// ECDSA 서명은 DER로 오므로 Web Crypto가 쓰는 r||s(64바이트)로 바꿈
function derToRaw(der) {
  if (der[0] !== 0x30) throw new Error('서명 형식이 올바르지 않아요.');
  let p = 2;
  if (der[1] & 0x80) p = 2 + (der[1] & 0x7f);
  const readInt = () => {
    if (der[p] !== 0x02) throw new Error('서명 형식이 올바르지 않아요.');
    const len = der[p + 1];
    let v = der.slice(p + 2, p + 2 + len);
    p += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

function checkClientData(clientDataJSON, type, challenge, origin) {
  const cd = JSON.parse(new TextDecoder().decode(clientDataJSON));
  if (cd.type !== type) throw new Error('요청 종류가 맞지 않아요.');
  if (cd.challenge !== challenge) throw new Error('인증 요청이 만료됐어요. 다시 시도해 주세요.');
  if (cd.origin !== origin) throw new Error('다른 주소에서 온 요청이에요.');
  return cd;
}

// 등록: 새 패스키의 공개키를 꺼냄
export async function verifyRegistration({ clientDataJSON, attestationObject }, { challenge, origin, rpId }) {
  checkClientData(clientDataJSON, 'webauthn.create', challenge, origin);
  const att = decodeCbor(attestationObject).value;
  const authData = parseAuthData(att.get('authData'));
  if (!equalBytes(authData.rpIdHash, await sha256Bytes(new TextEncoder().encode(rpId)))) throw new Error('사이트 주소가 맞지 않아요.');
  if (!authData.up) throw new Error('사용자 확인이 필요해요.');
  if (!authData.credentialId || !authData.cose) throw new Error('패스키 정보가 없어요.');
  const { alg, jwk } = coseToJwk(authData.cose);
  await importKey(alg, jwk); // 형식 확인
  return { credentialId: bytesToB64url(authData.credentialId), alg, jwk, signCount: authData.signCount };
}

// 로그인: 저장된 공개키로 서명 확인
export async function verifyAuthentication({ clientDataJSON, authenticatorData, signature }, { challenge, origin, rpId, alg, jwk, storedCount }) {
  checkClientData(clientDataJSON, 'webauthn.get', challenge, origin);
  const auth = parseAuthData(authenticatorData);
  if (!equalBytes(auth.rpIdHash, await sha256Bytes(new TextEncoder().encode(rpId)))) throw new Error('사이트 주소가 맞지 않아요.');
  if (!auth.up) throw new Error('사용자 확인이 필요해요.');
  const signed = new Uint8Array(authenticatorData.length + 32);
  signed.set(authenticatorData, 0);
  signed.set(await sha256Bytes(clientDataJSON), authenticatorData.length);
  const key = await importKey(alg, jwk);
  const ok = alg === -7
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), signed)
    : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, signed);
  if (!ok) throw new Error('패스키 서명이 맞지 않아요.');
  if (storedCount > 0 && auth.signCount > 0 && auth.signCount <= storedCount) throw new Error('복제된 패스키로 보여요. 운영자에게 알려주세요.');
  return { signCount: auth.signCount };
}
