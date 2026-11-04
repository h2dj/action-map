import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addActivity, updateEntity } from '../../src/domain/ops';
import type { MapDocument } from '../../src/domain/schema';
import { exportDocument } from '../../src/io/transfer';
import { buildSampleDocument } from '../../src/fixtures/sample';
import { createAutosave } from '../../src/persistence/autosave';
import { createIndexedDbRepository, type Repository } from '../../src/persistence/repository';
import { createSession } from '../../src/persistence/session';
import { createMapStore } from '../../src/store/mapStore';

let dbCount = 0;
const freshRepo = () => createIndexedDbRepository(`test-${++dbCount}`);

/** 앱 한 번 실행을 흉내낸다: 스토어 + 자동 저장 + 세션 */
function bootApp(repo: Repository, delayMs = 10) {
  const store = createMapStore();
  const autosave = createAutosave(store, repo, { delayMs });
  const session = createSession(store, repo, autosave);
  return { store, autosave, session };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('IndexedDB 저장소', () => {
  it('저장한 문서를 그대로 읽는다', async () => {
    const repo = freshRepo();
    const doc = buildSampleDocument();
    await repo.save(doc);
    expect(await repo.load(doc.workspace.id)).toEqual(doc);
    expect(await repo.list()).toEqual([{ id: doc.workspace.id, name: doc.workspace.name, updatedAt: doc.workspace.updatedAt }]);
  });

  it('손상된 문서는 오류로 알리고 원본을 지우지 않는다', async () => {
    const repo = freshRepo();
    const doc = buildSampleDocument();
    await repo.save({ ...doc, activities: { A02: { broken: true } } } as unknown as MapDocument);
    await expect(repo.load(doc.workspace.id)).rejects.toThrow('손상');
    expect(await repo.list()).toHaveLength(1);
  });
});

describe('F07 자동 저장과 재실행 복원', () => {
  it('처음 실행하면 빈 작업공간을 만들어 저장한다', async () => {
    const repo = freshRepo();
    const app = bootApp(repo);
    const r = await app.session.start();
    expect(r.restored).toBe(false);
    expect(await repo.list()).toHaveLength(1);
  });

  it('편집 후 다시 실행하면 마지막 상태가 복원된다', async () => {
    const repo = freshRepo();
    const first = bootApp(repo);
    await first.session.start();
    const id = first.store.getState().run('추가', (d) => addActivity(d, { name: 'IT학교' }));
    await first.autosave.flush();
    first.autosave.stop();

    const second = bootApp(repo);
    const r = await second.session.start();
    expect(r.restored).toBe(true);
    expect(second.store.getState().doc.activities[id].name).toBe('IT학교');
  });

  it('여러 번 바꿔도 잠시 뒤 한 번만 저장한다', async () => {
    vi.useFakeTimers();
    const store = createMapStore(buildSampleDocument());
    const repo = { ...memoryRepo(), save: vi.fn(async () => {}) };
    const autosave = createAutosave(store, repo, { delayMs: 500 });
    store.getState().run('a', (d) => updateEntity(d, 'A01', { name: '1' }));
    store.getState().run('b', (d) => updateEntity(d, 'A01', { name: '2' }));
    expect(autosave.status.getState().state).toBe('pending');
    await vi.advanceTimersByTimeAsync(500);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(autosave.status.getState().state).toBe('saved');
  });

  it('저장 실패를 알리고, 다시 시도할 수 있다', async () => {
    const store = createMapStore(buildSampleDocument());
    let fail = true;
    const repo = {
      ...memoryRepo(),
      save: vi.fn(async () => {
        if (fail) throw new Error('QuotaExceededError');
      }),
    };
    const autosave = createAutosave(store, repo, { delayMs: 1 });
    store.getState().run('a', (d) => updateEntity(d, 'A01', { name: '1' }));
    await autosave.flush();
    expect(autosave.status.getState()).toMatchObject({ state: 'error' });
    expect((autosave.status.getState() as { message: string }).message).toContain('QuotaExceededError');
    fail = false;
    await autosave.retry();
    expect(autosave.status.getState().state).toBe('saved');
  });

  it('가져오기는 새 작업공간으로 열고 기존 것을 덮어쓰지 않는다', async () => {
    const repo = freshRepo();
    const app = bootApp(repo);
    await app.session.start();
    const original = app.store.getState().doc.workspace.id;
    const text = exportDocument(buildSampleDocument());

    expect((await app.session.importText(text)).ok).toBe(true);
    expect((await app.session.importText(text)).ok).toBe(true);
    const list = await repo.list();
    expect(list).toHaveLength(3);
    expect(list.map((w) => w.id)).toContain(original);
    expect(app.store.getState().doc.activities.A02.name).toBe('IT학교');
  });

  it('잘못된 파일은 현재 작업공간을 바꾸지 않는다', async () => {
    const repo = freshRepo();
    const app = bootApp(repo);
    await app.session.start();
    const before = app.store.getState().doc;
    const r = await app.session.importText('{"format":"action-map","document":{}}');
    expect(r.ok).toBe(false);
    expect(app.store.getState().doc).toBe(before);
    expect(await repo.list()).toHaveLength(1);
  });

  it('작업공간을 전환하면 이전 변경을 먼저 저장한다', async () => {
    const repo = freshRepo();
    const app = bootApp(repo, 10_000);
    await app.session.start();
    const firstId = app.store.getState().doc.workspace.id;
    app.store.getState().run('추가', (d) => addActivity(d, { id: 'X1', name: '저장 전 활동' }));
    await app.session.createNew('두 번째');
    await app.session.switchTo(firstId);
    expect(app.store.getState().doc.activities.X1?.name).toBe('저장 전 활동');
  });
});

function memoryRepo(): Repository {
  const docs = new Map<string, MapDocument>();
  let last: string | undefined;
  return {
    save: async (d) => void docs.set(d.workspace.id, d),
    load: async (id) => docs.get(id),
    list: async () => [...docs.values()].map((d) => ({ id: d.workspace.id, name: d.workspace.name, updatedAt: d.workspace.updatedAt })),
    remove: async (id) => void docs.delete(id),
    getLastOpened: async () => last,
    setLastOpened: async (id) => void (last = id),
  };
}
