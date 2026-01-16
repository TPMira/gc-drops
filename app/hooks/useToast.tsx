
import { createPortal } from 'react-dom';
import { useCallback, useRef, useState } from 'react';

type Toast = { id: number; message: string; type?: 'success' | 'error' | 'info' };

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const notify = useCallback((message: string, type: Toast['type'] = 'info', ttlMs = 2500) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    // auto-remove
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttlMs);
  }, []);

  const ToastContainer = useCallback(() => {
    const content = (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={[
              'min-w-[220px] px-3 py-2 rounded shadow-lg border pointer-events-auto',
              'bg-black/80 backdrop-blur text-white border-white/10',
              t.type === 'success' ? 'ring-1 ring-emerald-500/40' : '',
              t.type === 'error' ? 'ring-1 ring-rose-500/40' : '',
              t.type === 'info' ? 'ring-1 ring-blue-500/40' : '',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
  }, [toasts]);

  return { notify, ToastContainer };
}