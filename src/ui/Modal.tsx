import { useEffect, useRef, type ReactNode } from 'react';

/** 네이티브 <dialog>로 초점 가두기와 Esc 닫기를 처리한다 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
