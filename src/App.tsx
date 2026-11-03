import { timeLayerOf } from './domain/time';
import { activityStatusLabel } from './domain/vocab';
import { buildSampleDocument } from './fixtures/sample';
import { mapStore, useMap } from './store/mapStore';

const layers = [
  ['past', '해온 일'],
  ['present', '진행 중인 일'],
  ['future', '하려는 일'],
] as const;

/** M1 임시 화면: 도메인 코어 확인용 목록. 지도 화면은 M3~M4에서 구현한다. */
export function App() {
  const doc = useMap((s) => s.doc);
  const activities = Object.values(doc.activities);
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <h1>활동 지도</h1>
      <p>
        {doc.workspace.name} · 활동 {activities.length} · 주체 {Object.keys(doc.actors).length} · 관계{' '}
        {Object.keys(doc.relations).length}
      </p>
      <button onClick={() => mapStore.getState().load(buildSampleDocument())}>예시 불러오기</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {layers.map(([layer, label]) => (
          <section key={layer}>
            <h2>{label}</h2>
            <ul>
              {activities
                .filter((a) => timeLayerOf(a) === layer)
                .map((a) => (
                  <li key={a.id}>
                    {a.parentId ? '└ ' : ''}
                    {a.name} <small>({activityStatusLabel[a.status]})</small>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
