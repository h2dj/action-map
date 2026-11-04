import { SCHEMA_VERSION } from '../domain/schema';

export class MigrationError extends Error {}

/**
 * 저장·가져오기 데이터의 스키마 버전을 현재 버전으로 올린다.
 * 버전이 오를 때마다 `migrations[n]`(n → n+1)을 추가한다.
 */
const migrations: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {
  /** v1 → v2: 순환 기록 컬렉션 추가 */
  1: (doc) => ({ ...doc, loops: doc.loops ?? {} }),
};

export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) throw new MigrationError('문서 형식이 아닙니다.');
  let doc = raw as Record<string, unknown>;
  const declared = doc.schemaVersion;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1)
    throw new MigrationError('스키마 버전이 없습니다.');
  let v: number = declared;
  if (v > SCHEMA_VERSION)
    throw new MigrationError(`이 데이터는 더 새로운 버전(v${v})에서 만들어졌습니다. 앱을 업데이트해 주세요.`);
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) throw new MigrationError(`v${v}에서 올릴 방법이 없습니다.`);
    doc = step(doc);
    v = v + 1;
    doc.schemaVersion = v;
  }
  return doc;
}
