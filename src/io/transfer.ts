/**
 * 구조화 데이터 내보내기·가져오기 (F08).
 * - 내보내기: 요소·관계·속성·보기 설정·스키마 버전을 포함. 비공개 메모는 기본 제외(G6).
 * - 가져오기: JSON → 버전 이전 → 스키마 검사 → 무결성 검사. 오류가 있으면 불러오지 않는다.
 *   항상 새 작업공간으로 불러와 기존 기록을 덮어쓰지 않는다. 엔티티·관계 ID는 보존한다.
 */
import { produce } from 'immer';
import { newId } from '../domain/ids';
import { MapDocument } from '../domain/schema';
import { hasErrors, validateDocument, type Issue } from '../domain/validate';
import { migrate, MigrationError } from './migrate';

export const EXPORT_FORMAT = 'action-map' as const;

export type ExportEnvelope = {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  includesPrivateNotes: boolean;
  document: MapDocument;
};

export type ExportOptions = { includePrivateNotes?: boolean; now?: string };

export function stripPrivateNotes(doc: MapDocument): MapDocument {
  return produce(doc, (d) => {
    for (const r of Object.values(d.relations)) for (const c of r.contributions ?? []) delete c.privateNote;
  });
}

export function exportDocument(doc: MapDocument, opts: ExportOptions = {}): string {
  const includePrivateNotes = opts.includePrivateNotes ?? false;
  const envelope: ExportEnvelope = {
    format: EXPORT_FORMAT,
    exportedAt: opts.now ?? new Date().toISOString(),
    includesPrivateNotes: includePrivateNotes,
    document: includePrivateNotes ? doc : stripPrivateNotes(doc),
  };
  return JSON.stringify(envelope, null, 2);
}

export function exportFileName(doc: MapDocument, now = new Date()): string {
  const safe = doc.workspace.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'action-map';
  const stamp = now.toISOString().slice(0, 10);
  return `${safe}_${stamp}.action-map.json`;
}

export type ImportResult =
  | { ok: true; doc: MapDocument; issues: Issue[] }
  | { ok: false; issues: Issue[] };

const fail = (code: string, message: string): ImportResult => ({ ok: false, issues: [{ level: 'error', code, message }] });

/** 가져온 데이터를 검사한다. 성공해도 경고(기간 역전 등)는 함께 돌려준다. */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('import.json', 'JSON 형식이 아닙니다.');
  }
  // 봉투(envelope) 또는 문서 자체 모두 허용
  const body =
    typeof raw === 'object' && raw !== null && (raw as { format?: unknown }).format === EXPORT_FORMAT
      ? (raw as { document?: unknown }).document
      : raw;

  let migrated: unknown;
  try {
    migrated = migrate(body);
  } catch (e) {
    if (e instanceof MigrationError) return fail('import.version', e.message);
    throw e;
  }

  const parsed = MapDocument.safeParse(migrated);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 50).map((i) => ({
        level: 'error' as const,
        code: 'import.schema',
        message: `${i.path.join('.') || '(문서)'}: ${i.message}`,
      })),
    };
  }
  const issues = validateDocument(parsed.data);
  if (hasErrors(issues)) return { ok: false, issues };
  return { ok: true, doc: parsed.data, issues };
}

/** 가져온 문서를 새 작업공간으로 만든다. 엔티티·관계 ID와 내용은 그대로 둔다. */
export function asNewWorkspace(doc: MapDocument, now = new Date().toISOString()): MapDocument {
  return produce(doc, (d) => {
    d.workspace.id = newId('workspace');
    d.workspace.createdAt = now;
    d.workspace.updatedAt = now;
  });
}
