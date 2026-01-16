'use client';

import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

type Toast = { id: number; message: string; type?: 'success' | 'error' | 'info' };

type ToastContextValue = {
  notify: (message: string, type?: Toast['type'], ttlMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const notify = useCallback((message: string, type: Toast['type'] = 'info', ttlMs = 2500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttlMs);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Renderiza o portal somente após montar no cliente para evitar hydration mismatch */}
      {mounted &&
        createPortal(
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                className={[
                  'min-w-[260px] px-4 py-2 rounded shadow-lg border pointer-events-auto',
                  'bg-black/80 backdrop-blur text-white border-white/10 text-center',
                  t.type === 'success' ? 'ring-1 ring-emerald-500/40' : '',
                  t.type === 'error' ? 'ring-1 ring-rose-500/40' : '',
                  t.type === 'info' ? 'ring-1 ring-blue-500/40' : '',
                ].join(' ')}
              >
                {t.message}
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}