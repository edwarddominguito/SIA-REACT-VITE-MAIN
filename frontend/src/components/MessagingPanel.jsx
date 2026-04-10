import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, streamRequest } from "@/api/client.js";
import { getCurrentUser } from "@/services/storageService.js";
import useMessageScrollPhysics from "@/hooks/useMessageScrollPhysics.js";
import "./messaging.css";

const DEFAULT_TRANSPORT = {
  appEnabled: true,
  smsMirrorConfigured: false,
  senderPhone: ""
};

const FALLBACK_POLL_INTERVAL_MS = 15000;
const STREAM_CONNECTED_POLL_INTERVAL_MS = 60000;
const STREAM_RECONNECT_DELAY_MS = 2000;
const MAX_CACHED_THREAD_MESSAGES = 200;
const THREAD_BOTTOM_THRESHOLD_PX = 72;
const THREAD_TIME_DIVIDER_GAP_MS = 1000 * 60 * 45;

const parseMessageTimestamp = (value) => {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isSameCalendarDay = (leftValue, rightValue) => {
  const left = leftValue instanceof Date ? leftValue : new Date(leftValue || "");
  const right = rightValue instanceof Date ? rightValue : new Date(rightValue || "");
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
};

const sortMessagesChronologically = (items) =>
  [...items].sort((a, b) => {
    const timeA = parseMessageTimestamp(a?.createdAt);
    const timeB = parseMessageTimestamp(b?.createdAt);
    if (timeA !== null && timeB !== null && timeA !== timeB) return timeA - timeB;
    if ((timeA !== null) !== (timeB !== null)) return timeA !== null ? -1 : 1;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });

const buildMessagingCacheKey = (userLike) => {
  const username = String(userLike?.username || "").trim();
  const role = String(userLike?.role || "").trim().toLowerCase();
  if (!username || !role) return "";
  return `messagingPanel:${role}:${username}`;
};

const readMessagingCache = (cacheKey) => {
  if (!cacheKey || typeof window === "undefined" || !window.sessionStorage) {
    return { contacts: [], selectedContact: "", threads: {} };
  }
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return { contacts: [], selectedContact: "", threads: {} };
    const parsed = JSON.parse(raw);
    const contacts = Array.isArray(parsed?.contacts) ? parsed.contacts : [];
    const selectedContact = String(parsed?.selectedContact || "").trim();
    const rawThreads = parsed?.threads && typeof parsed.threads === "object" ? parsed.threads : {};
    const threads = Object.fromEntries(
      Object.entries(rawThreads).map(([key, value]) => [
        String(key || "").trim(),
        Array.isArray(value) ? sortMessagesChronologically(value).slice(-MAX_CACHED_THREAD_MESSAGES) : []
      ]).filter(([key]) => Boolean(key))
    );
    return { contacts, selectedContact, threads };
  } catch {
    return { contacts: [], selectedContact: "", threads: {} };
  }
};

const writeMessagingCache = (cacheKey, value) => {
  if (!cacheKey || typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(value));
  } catch {
    // Best-effort cache only.
  }
};

const initialsFrom = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

const formatMessageTime = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const formatThreadDividerLabel = (value, previousValue) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const previousDate = new Date(previousValue || "");
  const showDate = Number.isNaN(previousDate.getTime()) || !isSameCalendarDay(date, previousDate);
  return date.toLocaleString(undefined, showDate
    ? {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }
    : {
        hour: "numeric",
        minute: "2-digit"
      });
};

const formatStatusLabel = (value, fallback = "") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const normalizeTransportMeta = (meta) => {
  const transport = meta?.transport && typeof meta.transport === "object" ? meta.transport : meta || {};
  return {
    appEnabled: transport.appEnabled !== false,
    smsMirrorConfigured: Boolean(transport.smsMirrorConfigured || meta?.smsConfigured),
    senderPhone: String(transport.senderPhone || meta?.senderPhone || "")
  };
};

const sortContactsByActivity = (items) =>
  [...items].sort((a, b) => {
    const timeA = Date.parse(a?.lastMessageAt || "");
    const timeB = Date.parse(b?.lastMessageAt || "");
    const hasTimeA = Number.isFinite(timeA);
    const hasTimeB = Number.isFinite(timeB);
    if (hasTimeA && hasTimeB && timeA !== timeB) return timeB - timeA;
    if (hasTimeA !== hasTimeB) return hasTimeB - hasTimeA;
    return String(a?.fullName || a?.username || "").localeCompare(String(b?.fullName || b?.username || ""));
  });

const contactLabel = (contact) => {
  if (!contact) return "Select a contact";
  return contact.fullName || `@${contact.username}`;
};

const avatarColorClass = (contact) => {
  const role = String(contact?.role || "").toLowerCase();
  if (role === "admin") return "avatar-role-admin";
  if (role === "agent") return "avatar-role-agent";
  return "avatar-role-customer";
};

const roleBadgeClass = (role) => {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return "messaging-role-badge role-admin";
  if (r === "agent") return "messaging-role-badge role-agent";
  return "messaging-role-badge role-customer";
};

const contactPreview = (contact) => {
  if (contact?.lastMessage) return contact.lastMessage;
  return `${contact?.role || "user"} | ${contact?.smsPhone || contact?.phone || "No phone on file"}`;
};

const isNearBottom = (element, threshold = THREAD_BOTTOM_THRESHOLD_PX) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
};

const mergeMessageList = (items, incoming) => {
  if (!incoming?.id) return items;
  const next = [...items];
  const index = next.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...incoming };
  } else {
    next.push(incoming);
  }
  return sortMessagesChronologically(next);
};

const mergeContactSummary = (items, summary) => {
  if (!summary?.username && !summary?.id) return items;
  const next = [...items];
  const index = next.findIndex((contact) =>
    (summary.username && contact.username === summary.username)
    || (summary.id && contact.id === summary.id)
  );
  if (index >= 0) {
    next[index] = { ...next[index], ...summary };
  } else {
    next.push(summary);
  }
  return sortContactsByActivity(next);
};

const messageGroupKey = (message) => {
  if (!message) return "";
  if (message.isOwn) return "own";
  return [
    "incoming",
    message.sender?.username,
    message.sender?.id,
    message.sender?.fullName,
    message.senderPhone,
    message.sender_phone
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "incoming";
};

const resolveSelectedContact = (items, preferredContact = "") => {
  const preferred = String(preferredContact || "").trim();
  if (!Array.isArray(items) || !items.length) return "";
  if (preferred && items.some((item) => item.username === preferred || item.id === preferred)) {
    return preferred;
  }
  return items[0]?.username || items[0]?.id || "";
};

const shouldShowThreadDivider = (currentMessage, previousMessage) => {
  const currentTimestamp = parseMessageTimestamp(currentMessage?.createdAt);
  if (currentTimestamp === null) return false;
  const previousTimestamp = parseMessageTimestamp(previousMessage?.createdAt);
  if (previousTimestamp === null) return true;
  if (!isSameCalendarDay(currentMessage?.createdAt, previousMessage?.createdAt)) return true;
  return (currentTimestamp - previousTimestamp) >= THREAD_TIME_DIVIDER_GAP_MS;
};

export default function MessagingPanel({ currentUser, feedback, preferredContact = "" }) {
  const resolvedCurrentUser = useMemo(() => {
    if (currentUser?.username && currentUser?.role) return currentUser;
    return getCurrentUser();
  }, [currentUser?.role, currentUser?.username]);
  const normalizedPreferredContact = useMemo(() => String(preferredContact || "").trim(), [preferredContact]);
  const cacheKey = useMemo(() => buildMessagingCacheKey(resolvedCurrentUser), [resolvedCurrentUser]);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [transport, setTransport] = useState(DEFAULT_TRANSPORT);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const searchInputRef = useRef(null);
  const threadBodyRef = useRef(null);
  const forceScrollRef = useRef(false);
  const selectedContactRef = useRef("");
  const streamConnectedRef = useRef(false);
  const contactsRef = useRef([]);
  const threadCacheRef = useRef({});
  const messagesRef = useRef([]);
  const initialThreadSnapRef = useRef(false);
  const {
    unreadCount,
    showJumpPill,
    handleMessagesChanged,
    notifyOwnMessage,
    notifyIncomingMessage,
    jumpToLatest,
    setActiveThread
  } = useMessageScrollPhysics({
    containerRef: threadBodyRef,
    isNearBottom,
    followThreshold: THREAD_BOTTOM_THRESHOLD_PX + 24,
    smoothDuration: 260
  });

  useEffect(() => {
    selectedContactRef.current = selectedContact;
    if (selectedContact) {
      forceScrollRef.current = true;
      initialThreadSnapRef.current = true;
    } else {
      initialThreadSnapRef.current = false;
    }
    setActiveThread(selectedContact);
    persistMessagingCache({ selectedContact });
    if (selectedContact) {
      const cachedMessages = threadCacheRef.current[selectedContact];
      setMessages(Array.isArray(cachedMessages) ? sortMessagesChronologically(cachedMessages) : []);
    } else {
      setMessages([]);
    }
  }, [selectedContact, setActiveThread]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    streamConnectedRef.current = isStreamConnected;
  }, [isStreamConnected]);

  useEffect(() => {
    if (!normalizedPreferredContact) return;
    const contactExists = contactsRef.current.some((contact) =>
      contact.username === normalizedPreferredContact || contact.id === normalizedPreferredContact
    );
    if (!contactExists) return;

    const nextSelectedContact = resolveSelectedContact(contactsRef.current, normalizedPreferredContact);
    if (!nextSelectedContact || nextSelectedContact === selectedContactRef.current) return;

    selectedContactRef.current = nextSelectedContact;
    forceScrollRef.current = true;
    initialThreadSnapRef.current = true;
    setSelectedContact(nextSelectedContact);
  }, [contacts, normalizedPreferredContact]);

  useEffect(() => {
    const cached = readMessagingCache(cacheKey);
    const cachedContacts = sortContactsByActivity(Array.isArray(cached.contacts) ? cached.contacts : []);
    const nextSelectedContact = resolveSelectedContact(cachedContacts, cached.selectedContact);
    contactsRef.current = cachedContacts;
    threadCacheRef.current = cached.threads || {};
    selectedContactRef.current = nextSelectedContact;
    setContacts(cachedContacts);
    setSelectedContact(nextSelectedContact);
    setMessages(nextSelectedContact ? sortMessagesChronologically(threadCacheRef.current[nextSelectedContact] || []) : []);
    setDraft("");
    setSearch("");
  }, [cacheKey]);

  const persistMessagingCache = (overrides = {}) => {
    if (!cacheKey) return;
    const nextContacts = Array.isArray(overrides.contacts) ? overrides.contacts : contactsRef.current;
    const nextSelectedContact = Object.prototype.hasOwnProperty.call(overrides, "selectedContact")
      ? String(overrides.selectedContact || "").trim()
      : selectedContactRef.current;
    const nextThreads = overrides.threads && typeof overrides.threads === "object"
      ? overrides.threads
      : threadCacheRef.current;
    writeMessagingCache(cacheKey, {
      contacts: nextContacts,
      selectedContact: nextSelectedContact,
      threads: nextThreads
    });
  };

  const updateThreadMessages = (contactKey, producer) => {
    const normalizedContactKey = String(contactKey || "").trim();
    if (!normalizedContactKey) return;
    const baseMessages = normalizedContactKey === selectedContactRef.current
      ? messagesRef.current
      : (threadCacheRef.current[normalizedContactKey] || []);
    const nextMessages = typeof producer === "function" ? producer(baseMessages) : producer;
    const normalizedMessages = Array.isArray(nextMessages) ? sortMessagesChronologically(nextMessages) : [];
    threadCacheRef.current = {
      ...threadCacheRef.current,
      [normalizedContactKey]: normalizedMessages.slice(-MAX_CACHED_THREAD_MESSAGES)
    };
    persistMessagingCache({ threads: threadCacheRef.current });
    if (normalizedContactKey === selectedContactRef.current) {
      setMessages(normalizedMessages);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    const pollIntervalMs = isStreamConnected ? STREAM_CONNECTED_POLL_INTERVAL_MS : FALLBACK_POLL_INTERVAL_MS;

    const loadContacts = async (showLoading = true) => {
      if (showLoading) setIsLoadingContacts(true);
      try {
        const res = await apiRequest("/api/messages/contacts", { method: "GET" });
        if (cancelled) return;
        const nextContacts = sortContactsByActivity(Array.isArray(res?.data) ? res.data : []);
        setContacts(nextContacts);
        contactsRef.current = nextContacts;
        setTransport(normalizeTransportMeta(res?.meta));
        setSelectedContact((prev) => {
          const nextSelectedContact = resolveSelectedContact(nextContacts, prev || selectedContactRef.current);
          selectedContactRef.current = nextSelectedContact;
          persistMessagingCache({ contacts: nextContacts, selectedContact: nextSelectedContact });
          return nextSelectedContact;
        });
      } catch (error) {
        if (!cancelled) {
          feedback?.notify(error?.message || "Unable to load message contacts.", "error");
        }
      } finally {
        if (!cancelled && showLoading) setIsLoadingContacts(false);
      }
    };

    loadContacts(true);
    intervalId = window.setInterval(() => {
      loadContacts(false);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [feedback, isStreamConnected]);

  useEffect(() => {
    if (!selectedContact) {
      setMessages([]);
      return undefined;
    }

    let cancelled = false;
    let intervalId = null;
    forceScrollRef.current = true;
    const pollIntervalMs = streamConnectedRef.current ? STREAM_CONNECTED_POLL_INTERVAL_MS : FALLBACK_POLL_INTERVAL_MS;
    const cachedMessages = threadCacheRef.current[selectedContact];
    if (Array.isArray(cachedMessages) && cachedMessages.length) {
      setMessages(sortMessagesChronologically(cachedMessages));
    }

    const loadMessages = async (showLoading = true) => {
      if (showLoading) setIsLoadingMessages(true);
      try {
        const res = await apiRequest(`/api/messages?contact=${encodeURIComponent(selectedContact)}&limit=200`, { method: "GET" });
        if (cancelled) return;
        if (selectedContactRef.current !== selectedContact) return;
        const nextMessages = sortMessagesChronologically(Array.isArray(res?.data) ? res.data : []);
        threadCacheRef.current = {
          ...threadCacheRef.current,
          [selectedContact]: nextMessages.slice(-MAX_CACHED_THREAD_MESSAGES)
        };
        persistMessagingCache({ threads: threadCacheRef.current, selectedContact });
        setMessages(nextMessages);
        setTransport(normalizeTransportMeta(res?.meta));
        const latestMessage = nextMessages[nextMessages.length - 1];
        if (latestMessage) {
          setContacts((prev) => {
            const nextContacts = mergeContactSummary(prev, {
              ...(prev.find((contact) => contact.username === selectedContact || contact.id === selectedContact) || {}),
              username: selectedContact,
              lastMessage: latestMessage.content || "",
              lastMessageAt: latestMessage.createdAt || ""
            });
            contactsRef.current = nextContacts;
            persistMessagingCache({ contacts: nextContacts, selectedContact });
            return nextContacts;
          });
        }
      } catch (error) {
        if (!cancelled) {
          feedback?.notify(error?.message || "Unable to load messages.", "error");
        }
      } finally {
        if (!cancelled && showLoading) setIsLoadingMessages(false);
      }
    };

    loadMessages(true);
    intervalId = window.setInterval(() => {
      loadMessages(false);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [selectedContact, feedback]);

  useEffect(() => {
    if (!resolvedCurrentUser?.username || !resolvedCurrentUser?.role) return undefined;

    let cancelled = false;
    let reconnectTimer = null;
    let controller = null;
    const setStreamConnectionState = (nextConnected) => {
      if (streamConnectedRef.current === nextConnected) return;
      streamConnectedRef.current = nextConnected;
      setIsStreamConnected(nextConnected);
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        await streamRequest("/api/messages/stream", {
          signal: controller.signal,
          onEvent: async ({ event, data }) => {
            if (cancelled) return;
            if (event === "ping") {
              setStreamConnectionState(true);
              return;
            }
            if (event === "ready") {
              setStreamConnectionState(true);
              if (data?.transport) {
                setTransport(normalizeTransportMeta(data.transport));
              }
              return;
            }
            if (!data || typeof data !== "object") return;

            setStreamConnectionState(true);
            if (data.contactSummary) {
              setContacts((prev) => {
                const nextContacts = mergeContactSummary(prev, data.contactSummary);
                contactsRef.current = nextContacts;
                persistMessagingCache({ contacts: nextContacts });
                return nextContacts;
              });
            }

            if ((event === "message_created" || data.type === "message_created") && data.message) {
              if (data.contactUsername && data.contactUsername === selectedContactRef.current) {
                const shouldFollowThread = data.message.isOwn || isNearBottom(threadBodyRef.current, THREAD_BOTTOM_THRESHOLD_PX + 24);
                forceScrollRef.current = shouldFollowThread;
                if (data.message.isOwn) {
                  notifyOwnMessage();
                } else {
                  notifyIncomingMessage({ shouldFollow: shouldFollowThread });
                }
                updateThreadMessages(data.contactUsername, (prev) => mergeMessageList(prev, data.message));
              }
              return;
            }

            if ((event === "message_status_updated" || data.type === "message_status_updated") && data.message) {
              const targetContact = data.contactUsername || selectedContactRef.current;
              if (targetContact) {
                updateThreadMessages(targetContact, (prev) => mergeMessageList(prev, data.message));
              }
            }
          }
        });
        if (!cancelled) {
          setStreamConnectionState(false);
          reconnectTimer = window.setTimeout(connect, STREAM_RECONNECT_DELAY_MS);
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setStreamConnectionState(false);
        reconnectTimer = window.setTimeout(connect, STREAM_RECONNECT_DELAY_MS);
      }
    };

    connect();
    return () => {
      cancelled = true;
      setStreamConnectionState(false);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (controller) controller.abort();
    };
  }, [resolvedCurrentUser?.role, resolvedCurrentUser?.username]);

  useEffect(() => {
    handleMessagesChanged({
      messages,
      forceFollow: forceScrollRef.current
    });
    forceScrollRef.current = false;
  }, [handleMessagesChanged, messages, selectedContact]);

  useEffect(() => {
    if (!initialThreadSnapRef.current || !selectedContact || isLoadingMessages) return undefined;
    if (!messages.length) return undefined;
    const snapToBottom = () => {
      const element = threadBodyRef.current;
      if (!element) return;
      element.scrollTop = element.scrollHeight;
    };
    snapToBottom();
    const firstFrameId = window.requestAnimationFrame(() => {
      snapToBottom();
      window.requestAnimationFrame(snapToBottom);
    });
    const timerId = window.setTimeout(() => {
      snapToBottom();
      initialThreadSnapRef.current = false;
    }, 120);
    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.clearTimeout(timerId);
    };
  }, [isLoadingMessages, messages.length, selectedContact]);

  const activeContact = useMemo(
    () => contacts.find((item) => item.username === selectedContact || item.id === selectedContact) || null,
    [contacts, selectedContact]
  );

  const filteredContacts = useMemo(() => {
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((contact) => {
      const haystack = [
        contact.fullName,
        contact.username,
        contact.role,
        contact.lastMessage,
        contact.smsPhone,
        contact.phone
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [contacts, search]);

  const activeAvatarLabel = activeContact ? initialsFrom(contactLabel(activeContact)) : "+";

  const helperText = useMemo(() => {
    const streamLabel = isStreamConnected ? "Realtime updates are connected." : "Realtime updates are reconnecting; REST polling is active.";
    if (transport.smsMirrorConfigured) {
      return transport.senderPhone
        ? `${streamLabel} Messages are stored in-app and SMS mirroring is enabled from ${transport.senderPhone}.`
        : `${streamLabel} Messages are stored in-app and SMS mirroring is enabled.`;
    }
    return `${streamLabel} Messages are stored in-app. SMS mirroring is currently unavailable.`;
  }, [isStreamConnected, transport]);
  const jumpPillText = unreadCount === 1 ? "1 new message" : `${unreadCount} new messages`;

  const sendMessage = async (event) => {
    event.preventDefault();
    const content = String(draft || "").trim();
    if (!activeContact || !content || isSending) return;

    try {
      setIsSending(true);
      const res = await apiRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          contact: activeContact.username || activeContact.id,
          content
        })
      });
      const nextMessage = res?.data;
      if (nextMessage?.id) {
        forceScrollRef.current = true;
        notifyOwnMessage();
        updateThreadMessages(selectedContactRef.current, (prev) => mergeMessageList(prev, nextMessage));
        setContacts((prev) => {
          const nextContacts = mergeContactSummary(prev, {
            ...activeContact,
            lastMessage: nextMessage.content || "",
            lastMessageAt: nextMessage.createdAt || ""
          });
          contactsRef.current = nextContacts;
          persistMessagingCache({ contacts: nextContacts });
          return nextContacts;
        });
      }
      setTransport(normalizeTransportMeta(res?.meta));
      setDraft("");
      if (res?.meta?.warning) {
        feedback?.notify(res.meta.warning, "info");
      } else {
        feedback?.notify(transport.smsMirrorConfigured ? "Message sent." : "Message sent in-app.", "success");
      }
    } catch (error) {
      const failedRecord = error?.data;
      if (failedRecord?.id) {
        forceScrollRef.current = true;
        notifyOwnMessage();
        updateThreadMessages(selectedContactRef.current, (prev) => mergeMessageList(prev, failedRecord));
      }
      feedback?.notify(error?.message || "Unable to send message.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleStartConversation = () => {
    setDraft("");
    setSearch("");
    const fallbackContact = resolveSelectedContact(contactsRef.current, selectedContactRef.current);
    if (fallbackContact) {
      selectedContactRef.current = fallbackContact;
      setSelectedContact(fallbackContact);
      persistMessagingCache({ selectedContact: fallbackContact });
    }
    searchInputRef.current?.focus();
  };

  return (
    <section className="messaging-shell">
      <div className="messaging-list-panel">
        <div className="messaging-list-head">
          <div>
            <h3>Messages</h3>
            <p>{filteredContacts.length} contacts available</p>
          </div>
          <button type="button" className="messaging-icon-btn" aria-label="Start a conversation" onClick={handleStartConversation}>
            <i className="bi bi-plus-lg"></i>
          </button>
        </div>

        <label className="messaging-search">
          <i className="bi bi-search"></i>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search contacts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="messaging-group-label">Available contacts</div>
        <div className="messaging-contact-list">
          {filteredContacts.map((contact) => (
            <button
              key={contact.id || contact.username}
              type="button"
              className={`messaging-contact-item ${activeContact?.username === contact.username ? "active" : ""}`}
              onClick={() => setSelectedContact(contact.username || contact.id)}
            >
              <div className={`messaging-contact-avatar ${avatarColorClass(contact)}`}>{initialsFrom(contactLabel(contact))}</div>
              <div className="messaging-contact-main">
                <div className="messaging-contact-row">
                  <div className="messaging-contact-name">{contactLabel(contact)}</div>
                  <div className="messaging-contact-time">
                    {contact.lastMessageAt ? formatMessageTime(contact.lastMessageAt) : <span className={roleBadgeClass(contact.role)}>{formatStatusLabel(contact.role)}</span>}
                  </div>
                </div>
                <div className="messaging-contact-meta">
                  <span>{contactPreview(contact)}</span>
                </div>
              </div>
            </button>
          ))}
          {!isLoadingContacts && !filteredContacts.length && (
            <div className="messaging-empty">No contacts are available for your role yet.</div>
          )}
          {isLoadingContacts && <div className="messaging-empty">Loading contacts...</div>}
        </div>
      </div>

      <div className="messaging-thread-panel">
        <div className="messaging-thread-topbar">
          <div className="messaging-thread-profile">
            <div className={`messaging-thread-avatar ${activeContact ? avatarColorClass(activeContact) : ''}`}>{activeAvatarLabel}</div>
            <div>
              <strong>{activeContact ? contactLabel(activeContact) : "Start a conversation"}</strong>
              <div className="small muted">
                {activeContact
                  ? <><span className={roleBadgeClass(activeContact.role)}>{formatStatusLabel(activeContact.role)}</span> <span style={{margin:'0 2px'}}>|</span> {activeContact.smsPhone || activeContact.phone || "No phone number on file"}</>
                  : "Choose a contact to open a conversation."}
              </div>
            </div>
          </div>
        </div>

        <div ref={threadBodyRef} className="messaging-thread-body">
          {isLoadingMessages && <div className="messaging-empty">Loading messages...</div>}
          {!isLoadingMessages && !messages.length && activeContact && (
            <div className="messaging-empty">No messages yet. Send the first message below.</div>
          )}
          {!isLoadingMessages && !activeContact && (
            <div className="messaging-empty">Choose a contact to start a conversation.</div>
          )}

          {messages.map((message, index) => {
            const previousMessage = index > 0 ? messages[index - 1] : null;
            const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
            const currentGroupKey = messageGroupKey(message);
            const startsGroup = messageGroupKey(previousMessage) !== currentGroupKey;
            const endsGroup = messageGroupKey(nextMessage) !== currentGroupKey;
            const showIncomingAvatar = !message.isOwn && endsGroup;
            const showIncomingAuthor = !message.isOwn && startsGroup;
            const showThreadDivider = shouldShowThreadDivider(message, previousMessage);

            return (
              <React.Fragment key={message.id}>
                {showThreadDivider ? (
                  <div className="message-time-divider">
                    <span>{formatThreadDividerLabel(message.createdAt, previousMessage?.createdAt)}</span>
                  </div>
                ) : null}
                <div
                  className={`message-row ${message.isOwn ? "own" : "incoming"} ${startsGroup ? "group-start" : "group-middle"} ${endsGroup ? "group-end" : "group-continue"}`}
                >
                  {!message.isOwn ? (
                    showIncomingAvatar ? (
                      <div className={`message-avatar ${activeContact ? avatarColorClass(activeContact) : ''}`}>
                        {initialsFrom(message.sender?.fullName || message.sender?.username)}
                      </div>
                    ) : (
                      <div className="message-avatar message-avatar-placeholder" aria-hidden="true"></div>
                    )
                  ) : null}
                  <article className={`message-bubble ${message.isOwn ? "own" : "incoming"} ${message.status === "failed" ? "failed" : ""} ${startsGroup ? "group-start" : "group-middle"}`}>
                    {showIncomingAuthor ? (
                      <div className="message-author">{message.sender?.fullName || `@${message.sender?.username || "unknown"}`}</div>
                    ) : null}
                    <div className="message-bubble-text">{message.content}</div>
                    <div className="message-bubble-meta">
                      <span>{formatMessageTime(message.createdAt)}</span>
                      <span className="text-uppercase">{formatStatusLabel(message.status, message.direction)}</span>
                      <span className="text-uppercase">{message.channel === "sms" ? "SMS" : "In-app"}</span>
                    </div>
                    {message.smsStatus ? (
                      <div className="message-bubble-meta">
                        <span>SMS mirror: {formatStatusLabel(message.smsStatus)}</span>
                      </div>
                    ) : null}
                    {message.errorMessage ? <div className="message-bubble-error">{message.errorMessage}</div> : null}
                    {message.smsErrorMessage ? <div className="message-bubble-error">SMS mirror: {message.smsErrorMessage}</div> : null}
                  </article>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {showJumpPill ? (
          <button
            type="button"
            className="messaging-jump-pill"
            onClick={jumpToLatest}
            aria-label={`Jump to latest messages (${jumpPillText})`}
          >
            <span>{jumpPillText}</span>
            <i className="bi bi-arrow-down"></i>
          </button>
        ) : null}

        <form className="messaging-compose" onSubmit={sendMessage}>
          <div className="messaging-compose-bar">
            <textarea
              className="messaging-compose-input"
              rows="1"
              placeholder={activeContact ? `Type your message to ${contactLabel(activeContact)}...` : "Select a contact first"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!activeContact || isSending}
            ></textarea>
            <button className="messaging-send-btn" disabled={!activeContact || !draft.trim() || isSending}>
              <i className={`bi ${isSending ? "bi-hourglass-split" : "bi-send-fill"}`}></i>
            </button>
          </div>
          <div className="messaging-compose-actions">
            <div className="small muted">{helperText}</div>
            {resolvedCurrentUser?.username ? <div className="small muted">Signed in as @{resolvedCurrentUser.username}</div> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
