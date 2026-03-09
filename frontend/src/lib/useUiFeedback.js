import { useCallback, useEffect, useRef, useState } from "react";

export default function useUiFeedback() {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const timersRef = useRef(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const closeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback((message, type = "info", duration = 3200) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, duration);

    timersRef.current.set(id, timer);
  }, []);

  const askConfirm = useCallback((options) => {
    setConfirmState({
      title: options?.title || "Please confirm",
      message: options?.message || "Are you sure you want to continue?",
      confirmText: options?.confirmText || "Confirm",
      cancelText: options?.cancelText || "Cancel",
      variant: options?.variant || "danger",
      onConfirm: options?.onConfirm || null
    });
  }, []);

  const cancelConfirm = useCallback(() => setConfirmState(null), []);

  const confirm = useCallback(() => {
    const cb = confirmState?.onConfirm;
    setConfirmState(null);
    if (typeof cb === "function") cb();
  }, [confirmState]);

  return {
    toasts,
    notify,
    closeToast,
    confirmState,
    askConfirm,
    cancelConfirm,
    confirm
  };
}
