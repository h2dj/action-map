import { describe, expect, it } from 'vitest';
import { addActivity, deleteEntity, updateEntity } from '../../src/domain/ops';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { createMapStore } from '../../src/store/mapStore';

describe('실행 취소·다시 실행 (F09)', () => {
  it('삭제를 되돌리면 활동과 관계가 복원된다 (검증 시나리오 7)', () => {
    const store = createMapStore(buildSampleDocument());
    const before = store.getState().doc;
    store.getState().run('IT학교 삭제', (d) => deleteEntity(d, 'A02', 'cascade'));
    expect(store.getState().doc.activities.A02).toBeUndefined();

    store.getState().undo();
    const restored = store.getState().doc;
    expect(restored.activities).toEqual(before.activities);
    expect(restored.relations).toEqual(before.relations);

    store.getState().redo();
    expect(store.getState().doc.activities.A02).toBeUndefined();
  });

  it('거부된 연산은 문서와 기록을 바꾸지 않는다', () => {
    const store = createMapStore(buildSampleDocument());
    const before = store.getState();
    expect(() => store.getState().run('순환', (d) => updateEntity(d, 'A02', { parentId: 'A12' }))).toThrow();
    expect(store.getState().doc).toBe(before.doc);
    expect(store.getState().past).toHaveLength(0);
  });

  it('새 작업은 다시 실행 기록을 비운다', () => {
    const store = createMapStore(buildSampleDocument());
    store.getState().run('추가', (d) => addActivity(d, { name: '새 활동' }));
    store.getState().undo();
    expect(store.getState().future).toHaveLength(1);
    store.getState().run('이름 변경', (d) => updateEntity(d, 'A01', { name: '시민단체 기술지원' }));
    expect(store.getState().future).toHaveLength(0);
  });

  it('run은 연산 결과를 돌려준다', () => {
    const store = createMapStore(buildSampleDocument());
    const id = store.getState().run('추가', (d) => addActivity(d, { name: '새 활동' }));
    expect(store.getState().doc.activities[id].name).toBe('새 활동');
  });
});
