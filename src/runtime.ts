/** 앱 실행 단위의 싱글턴: 스토어 + 브라우저 저장소 + 자동 저장 + 세션 */
import { createAutosave } from './persistence/autosave';
import { createIndexedDbRepository } from './persistence/repository';
import { createSession } from './persistence/session';
import { mapStore } from './store/mapStore';

export const repository = createIndexedDbRepository();
export const autosave = createAutosave(mapStore, repository);
export const session = createSession(mapStore, repository, autosave);

export function downloadText(fileName: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadDataUrl(fileName: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
}
