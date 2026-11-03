/**
 * 가운데 영역 (M3 임시): 시간층별 활동 카드. 지도 보기(시간·협력·목적)는 M4에서 이 자리에 들어온다.
 * 기록이 없으면 빈 상태 안내를 보여준다 (F10).
 */
import { addActivity } from '../domain/ops';
import { timeLayerOf } from '../domain/time';
import { activityStatusLabel } from '../domain/vocab';
import { buildSampleDocument } from '../fixtures/sample';
import { session } from '../runtime';
import { useMap } from '../store/mapStore';
import { tryRun, useUi } from './uiStore';

const layers = [
  ['past', '해온 일'],
  ['present', '진행 중인 일'],
  ['future', '하려는 일'],
] as const;

export function Overview() {
  const doc = useMap((s) => s.doc);
  const selection = useUi((s) => s.selection);
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

  // 선택 대상과 직접 연결된 활동을 강조 (F06 미리보기)
  const selectedId = selection?.kind === 'entity' ? selection.id : undefined;
  const neighbors = new Set<string>();
  if (selectedId)
    for (const r of Object.values(doc.relations)) {
      if (r.from === selectedId) neighbors.add(r.to);
      if (r.to === selectedId) neighbors.add(r.from);
    }

  return (
    <div className="board" aria-label="시간층별 활동">
      {layers.map(([layer, label]) => (
        <section key={layer} className={`lane lane-${layer}`}>
          <h2>{label}</h2>
          <ul>
            {activities
              .filter((a) => timeLayerOf(a) === layer)
              .map((a) => {
                const parent = a.parentId ? doc.activities[a.parentId] : undefined;
                const state = a.id === selectedId ? 'selected' : neighbors.has(a.id) ? 'neighbor' : selectedId ? 'dim' : '';
                return (
                  <li key={a.id}>
                    <button className={`card ${state}`} onClick={() => select({ kind: 'entity', id: a.id })}>
                      <span className="card-title">{a.name}</span>
                      <span className="card-meta">
                        {activityStatusLabel[a.status]}
                        {parent && ` · ${parent.name}의 하위`}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
