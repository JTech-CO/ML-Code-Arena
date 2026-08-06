-- 비밀번호 해시가 argon2id 인지 스키마가 보장한다 (M3 DoD 9).
--
-- 애플리케이션 코드만 지키면 되는 규약은 언젠가 다른 경로가 뚫는다. 실제로 M2 의
-- 벤치 도구가 사용자 행을 만들면서 자리표시자 문자열을 넣고 있었다. 그 경로는
-- 로그인에 쓰이지 않지만, "DB 에 약한 해시가 없다"는 명제는 그것만으로 깨진다.
--
-- 여기서 막으면 어떤 경로로 들어와도 깨질 수 없다.

ALTER TABLE users
  ADD CONSTRAINT users_password_hash_argon2id
  CHECK (starts_with(password_hash, '$argon2id$'));

COMMENT ON CONSTRAINT users_password_hash_argon2id ON users IS
  'docs/TECHNICAL.md §8.1 — 평문·약한 해시가 저장될 수 없게 한다.';
