import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_FOLLOW_THRESHOLD_PX = 72;
const DEFAULT_SMOOTH_DURATION_MS = 260;

const defaultIsNearBottom = (element, threshold = DEFAULT_FOLLOW_THRESHOLD_PX) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
};

const buildLastMessageKey = (messages) => {
  if (!Array.isArray(messages) || !messages.length) return "";
  const lastMessage = messages[messages.length - 1] || null;
  return String(lastMessage?.id || `${lastMessage?.createdAt || ""}:${lastMessage?.content || ""}`).trim();
};

const getMaxScrollTop = (element) => Math.max((element?.scrollHeight || 0) - (element?.clientHeight || 0), 0);

export default function useMessageScrollPhysics({
  containerRef,
  isNearBottom = defaultIsNearBottom,
  followThreshold = DEFAULT_FOLLOW_THRESHOLD_PX,
  smoothDuration = DEFAULT_SMOOTH_DURATION_MS
} = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isReadingOlderMessages, setIsReadingOlderMessages] = useState(false);

  const pendingModeRef = useRef("none");
  const activeThreadRef = useRef("");
  const hasPrimedThreadRef = useRef(false);
  const initialBottomPinPendingRef = useRef(false);
  const lastMessageKeyRef = useRef("");
  const prefersReducedMotionRef = useRef(false);
  const delayedSyncTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      prefersReducedMotionRef.current = Boolean(mediaQuery.matches);
    };
    syncPreference();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncPreference);
      return () => mediaQuery.removeEventListener("change", syncPreference);
    }
    mediaQuery.addListener(syncPreference);
    return () => mediaQuery.removeListener(syncPreference);
  }, []);

  const clearDelayedSync = useCallback(() => {
    if (typeof window === "undefined" || !delayedSyncTimerRef.current) return;
    window.clearTimeout(delayedSyncTimerRef.current);
    delayedSyncTimerRef.current = null;
  }, []);

  const syncReadingState = useCallback(() => {
    const element = containerRef?.current;
    if (!element) return true;
    const nearBottom = isNearBottom(element, followThreshold);
    setIsReadingOlderMessages((prev) => (prev === !nearBottom ? prev : !nearBottom));
    if (nearBottom) {
      setUnreadCount((prev) => (prev === 0 ? prev : 0));
    }
    return nearBottom;
  }, [containerRef, followThreshold, isNearBottom]);

  const scrollToLatest = useCallback(({ instant = false } = {}) => {
    const element = containerRef?.current;
    if (!element) return;

    const targetScrollTop = getMaxScrollTop(element);
    clearDelayedSync();

    if (instant || prefersReducedMotionRef.current || typeof element.scrollTo !== "function") {
      element.scrollTop = targetScrollTop;
      syncReadingState();
      return;
    }

    element.scrollTo({ top: targetScrollTop, behavior: "smooth" });

    if (typeof window !== "undefined") {
      const settleDelayMs = Math.max(140, Math.min(Number(smoothDuration) || DEFAULT_SMOOTH_DURATION_MS, 420));
      delayedSyncTimerRef.current = window.setTimeout(() => {
        delayedSyncTimerRef.current = null;
        syncReadingState();
      }, settleDelayMs);
    }
  }, [clearDelayedSync, containerRef, smoothDuration, syncReadingState]);

  useEffect(() => {
    const element = containerRef?.current;
    if (!element) return undefined;

    const handleScroll = () => {
      syncReadingState();
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    syncReadingState();

    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, syncReadingState]);

  useEffect(() => () => {
    clearDelayedSync();
  }, [clearDelayedSync]);

  const setActiveThread = useCallback((threadKey) => {
    const normalizedThreadKey = String(threadKey || "").trim();
    if (normalizedThreadKey === activeThreadRef.current) return;

    activeThreadRef.current = normalizedThreadKey;
    hasPrimedThreadRef.current = false;
    initialBottomPinPendingRef.current = true;
    lastMessageKeyRef.current = "";
    pendingModeRef.current = "none";
    clearDelayedSync();
    setUnreadCount(0);
    setIsReadingOlderMessages(false);
  }, [clearDelayedSync]);

  const notifyOwnMessage = useCallback(() => {
    pendingModeRef.current = "force-follow";
  }, []);

  const notifyIncomingMessage = useCallback(({ shouldFollow = false } = {}) => {
    pendingModeRef.current = shouldFollow ? "soft-follow" : "hold-position";
  }, []);

  const handleMessagesChanged = useCallback(({ messages, forceFollow = false } = {}) => {
    const list = Array.isArray(messages) ? messages : [];
    const element = containerRef?.current;
    const nextLastMessageKey = buildLastMessageKey(list);

    if (!element) {
      lastMessageKeyRef.current = nextLastMessageKey;
      pendingModeRef.current = "none";
      return;
    }

    if (!hasPrimedThreadRef.current) {
      if (!list.length) {
        pendingModeRef.current = "none";
        syncReadingState();
        return;
      }
      hasPrimedThreadRef.current = true;
      lastMessageKeyRef.current = nextLastMessageKey;
      pendingModeRef.current = "none";
      const shouldPinInitialBottom = initialBottomPinPendingRef.current || forceFollow;
      initialBottomPinPendingRef.current = false;
      if (shouldPinInitialBottom) {
        scrollToLatest({ instant: true });
      } else {
        syncReadingState();
      }
      return;
    }

    const previousLastMessageKey = lastMessageKeyRef.current;
    lastMessageKeyRef.current = nextLastMessageKey;
    const hasNewTailMessage = Boolean(nextLastMessageKey) && nextLastMessageKey !== previousLastMessageKey;

    if (!hasNewTailMessage) {
      pendingModeRef.current = "none";
      if (!list.length) {
        setUnreadCount(0);
        setIsReadingOlderMessages(false);
        return;
      }
      syncReadingState();
      return;
    }

    const pendingMode = pendingModeRef.current;
    pendingModeRef.current = "none";
    const nearBottom = isNearBottom(element, followThreshold);
    const shouldFollow = forceFollow || pendingMode === "force-follow" || pendingMode === "soft-follow" || nearBottom;

    if (shouldFollow) {
      setUnreadCount(0);
      scrollToLatest();
      return;
    }

    setIsReadingOlderMessages(true);
    setUnreadCount((prev) => prev + 1);
  }, [containerRef, followThreshold, isNearBottom, scrollToLatest, syncReadingState]);

  const jumpToLatest = useCallback(() => {
    setUnreadCount(0);
    scrollToLatest();
  }, [scrollToLatest]);

  return {
    unreadCount,
    isReadingOlderMessages,
    showJumpPill: unreadCount > 0 && isReadingOlderMessages,
    handleMessagesChanged,
    notifyOwnMessage,
    notifyIncomingMessage,
    jumpToLatest,
    setActiveThread
  };
}
