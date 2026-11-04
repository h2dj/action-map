/**
 * 브라우저 저장소 (F07). IndexedDB(Dexie)에 작업공간 문서를 통째로 저장한다.
 * 저장 형식은 내보내기와 같은 MapDocument이며, 읽을 때 버전 이전과 스키마 검사를 거친다.
 */
import Dexie, { type Table } from 'dexie';
import { MapDocument, type Id } from '../domain/schema';
import { migrate } from '../io/migrate';

export type WorkspaceSummary = { id: Id; name: string; updatedAt: string };

/** 저장소 인터페이스. 테스트에서는 메모리 구현으로 바꿔 쓸 수 있다. */
export interface Repository {
  save(doc: MapDocument): Promise<void>;
  load(id: Id): Promise<MapDocument | undefined>;
  list(): Promise<WorkspaceSummary[]>;
  remove(id: Id): Promise<void>;
  getLastOpened(): Promise<Id | undefined>;
  setLastOpened(id: Id): Promise<void>;
}

type WorkspaceRow = WorkspaceSummary & { doc: unknown };
type MetaRow = { key: string; value: string };

class ActionMapDB extends Dexie {
  workspaces!: Table<WorkspaceRow, Id>;
  meta!: Table<MetaRow, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ workspaces: 'id, updatedAt', meta: 'key' });
  }
}

export class CorruptDocumentError extends Error {
  constructor(
    readonly workspaceId: Id,
    message: string,
  ) {
    super(message);
    this.name = 'CorruptDocumentError';
  }
}

export function createIndexedDbRepository(dbName = 'action-map'): Repository & { close(): void } {
  const db = new ActionMapDB(dbName);
  return {
    async save(doc) {
      await db.workspaces.put({
        id: doc.workspace.id,
        name: doc.workspace.name,
        updatedAt: doc.workspace.updatedAt,
        doc,
      });
    },
    async load(id) {
      const row = await db.workspaces.get(id);
      if (!row) return undefined;
      let migrated: unknown;
      try {
        migrated = migrate(row.doc);
      } catch (e) {
        throw new CorruptDocumentError(id, (e as Error).message);
      }
      const parsed = MapDocument.safeParse(migrated);
      if (!parsed.success) throw new CorruptDocumentError(id, '저장된 문서가 손상되었습니다.');
      return parsed.data;
    },
    async list() {
      const rows = await db.workspaces.orderBy('updatedAt').reverse().toArray();
      return rows.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
    },
    async remove(id) {
      await db.workspaces.delete(id);
    },
    async getLastOpened() {
      return (await db.meta.get('lastOpened'))?.value;
    },
    async setLastOpened(id) {
      await db.meta.put({ key: 'lastOpened', value: id });
    },
    close: () => db.close(),
  };
}
