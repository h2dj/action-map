/** 가운데 영역: 기록이 없으면 빈 상태 안내(F10), 있으면 지도 보기를 보여준다. */
import type { ReactNode } from 'react';
import { addActivity } from '../domain/ops';
import { buildSampleDocument } from '../fixtures/sample';
import { session } from '../runtime';
import { useMap } from '../store/mapStore';
import { tryRun, useUi } from './uiStore';

export function Overview({ children }: { children: ReactNode }) {
  const doc = useMap((s) => s.doc);
  const select = useUi((s) => s.select);
  const activities = Object.values(doc.activities);

  if (activities.length === 0 && Object.keys(doc.actors).length === 0) {
    return (
      <div className="empty-state">
        <h2>무엇을 해왔고, 하고 있고, 하려 하나요?</h2>
        <p>활동 이름만 적어도 시작할 수 있습니다. 날짜·역할·근거는 나중에 채워도 됩니다.</p>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              const id = tryRun('활동 추가', (d) => addActivity(d, { name: '새 활동' }));
              if (id) select({ kind: 'entity', id }, { justCreated: true });
            }}
          >
            + 첫 활동 추가
          </button>
          <button onClick={() => void session.openCopy(buildSampleDocument())}>예시 불러오기</button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
