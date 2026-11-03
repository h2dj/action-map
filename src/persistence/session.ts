/**
 * 작업공간 열기·전환·가져오기를 묶는다. 재실행 시 마지막 작업공간을 복원한다 (F07).
 */
import { createEmptyDocument } from '../domain/ops';
import type { Id, MapDocument } from '../domain/schema';
import type { Issue } from '../domain/validate';
import { asNewWorkspace, parseImport } from '../io/transfer';
import type { MapStore } from '../store/mapStore';
import type { Autosave } from './autosave';
import { CorruptDocumentError, type Repository } from './repository';

export type OpenResult = { doc: MapDocument; restored: boolean; warning?: string };

export function createSession(store: MapStore, repo: Repository, autosave: Autosave) {
  /** 이미 저장소에 있는 문서를 연다 */
  const show = async (doc: MapDocument) => {
    store.getState().load(doc);
    autosave.markSaved(doc);
    await repo.setLastOpened(doc.workspace.id);
  };
  /** 새 문서를 열고 바로 저장한다 */
  const showNew = async (doc: MapDocument) => {
    store.getState().load(doc);
    await autosave.flush();
  };

  return {
    /** 앱 시작 시 호출. 마지막 작업공간을 복원하고, 없거나 손상되었으면 새로 만든다. */
    async start(defaultName = '내 활동 지도'): Promise<OpenResult> {
      let warning: string | undefined;
      try {
        const last = await repo.getLastOpened();
        const candidates = [last, ...(await repo.list()).map((w) => w.id)].filter((x): x is Id => !!x);
        for (const id of candidates) {
          try {
            const doc = await repo.load(id);
            if (doc) {
              await show(doc);
              return { doc, restored: true, warning };
            }
          } catch (e) {
            if (!(e instanceof CorruptDocumentError)) throw e;
            warning = `작업공간 ${id}을(를) 읽지 못했습니다(${e.message}). 다른 작업공간을 열었습니다. 원본은 저장소에 남아 있습니다.`;
          }
        }
      } catch (e) {
        warning = `브라우저 저장소를 사용할 수 없습니다: ${(e as Error).message}. 변경 내용은 파일 내보내기로 보관하세요.`;
        store.getState().load(createEmptyDocument(defaultName));
        return { doc: store.getState().doc, restored: false, warning };
      }
      const doc = createEmptyDocument(defaultName);
      await showNew(doc);
      return { doc, restored: false, warning };
    },

    async switchTo(id: Id): Promise<void> {
      await autosave.flush();
      const doc = await repo.load(id);
      if (!doc) throw new Error('작업공간을 찾을 수 없습니다.');
      await show(doc);
    },

    async createNew(name: string): Promise<MapDocument> {
      await autosave.flush();
      const doc = createEmptyDocument(name);
      await showNew(doc);
      return doc;
    },

    /** 내보낸 파일을 새 작업공간으로 불러온다. 오류가 있으면 아무것도 바꾸지 않는다. */
    async importText(text: string): Promise<{ ok: boolean; issues: Issue[] }> {
      const result = parseImport(text);
      if (!result.ok) return { ok: false, issues: result.issues };
      await autosave.flush();
      const doc = asNewWorkspace(result.doc);
      await showNew(doc);
      return { ok: true, issues: result.issues };
    },

    /** 표본 데이터 등 준비된 문서를 새 작업공간으로 연다 */
    async openCopy(doc: MapDocument): Promise<void> {
      await autosave.flush();
      await showNew(asNewWorkspace(doc));
    },

    async remove(id: Id): Promise<void> {
      if (store.getState().doc.workspace.id === id) throw new Error('열려 있는 작업공간은 삭제할 수 없습니다.');
      await repo.remove(id);
    },
  };
}

export type Session = ReturnType<typeof createSession>;
