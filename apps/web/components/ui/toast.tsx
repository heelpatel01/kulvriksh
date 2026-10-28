'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icon';
import styles from './interactive.module.css';

type ToastTone = 'success' | 'info' | 'warning';
interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

/** Announces short confirmations in a polite live region and shows them as toasts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((text: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setMessages((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setMessages((current) => current.filter((message) => message.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`${styles.toast} ${styles[`toast-${message.tone}`]}`}>
            <Icon name={message.tone === 'success' ? 'check' : 'info'} size={16} />
            <span>{message.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
