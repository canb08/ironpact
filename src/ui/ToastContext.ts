import { createContext } from 'react';

export interface ToastOptions {
  message: string;
  timeoutMs?: number;
  action?: { label: string; onClick: () => void };
}

export interface ToastControls {
  showToast: (toast: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

export const ToastContext = createContext<ToastControls | null>(null);
