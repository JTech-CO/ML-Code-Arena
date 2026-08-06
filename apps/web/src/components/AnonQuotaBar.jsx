import { X } from 'lucide-react';

import { useAuthStore } from '../stores/auth.js';

import styles from './AnonQuotaBar.module.css';

/** 이 값 이하로 남았을 때만 노출한다. 10개부터 계속 보이면 압박이 된다 (§7.3). */
const SHOW_THRESHOLD = 3;

/**
 * 익명 잔여 한도 스트립 (docs/DESIGN.md §7.3, ADR-0005).
 *
 * 이 제한의 목적은 방어가 아니라 가입 유도다. 그래서 문구가 위협("곧 막힙니다")이
 * 아니라 제안("기록이 유지됩니다")이다. 전환 동력은 **기록 보존 약속**에 있다.
 */
export function AnonQuotaBar() {
  const anonymous = useAuthStore((state) => state.anonymous);
  const user = useAuthStore((state) => state.user);
  const dismissed = useAuthStore((state) => state.quotaDismissed);
  const dismiss = useAuthStore((state) => state.dismissQuota);

  if (user || dismissed || !anonymous) return null;
  if (anonymous.remaining > SHOW_THRESHOLD) return null;

  return (
    <div className={styles.bar}>
      <p className={styles.text}>
        로그인 없이 <span className="mono">{anonymous.remaining}</span>문제 더 풀 수 있습니다.
        가입하면 지금 기록이 유지됩니다.
      </p>
      <button type="button" className={styles.close} onClick={dismiss} aria-label="안내 닫기">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
