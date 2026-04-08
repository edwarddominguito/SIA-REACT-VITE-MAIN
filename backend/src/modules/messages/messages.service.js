export const registerMessagesServiceRoutes = (api, model) => {
  const deps = model.getDeps();
  const {
    asyncHandler,
    requireRole,
    getRequestUserContext,
    hasRequestUserContext,
    registerMessageStreamClient,
    writeMessageStreamEvent,
    getMessageTransportMeta,
    loadDb,
    findUserRecord,
    clean,
    buildMessageContactSummaries,
    normalizeRecordCollection,
    canMessageUser,
    toRole,
    normalizeSmsPhone,
    normalizeAvailabilityStatus,
    normalizeAccountStatus,
    toIso,
    getLegacyMessageTransportMeta,
    dbPool,
    findUserByNormalizedPhone,
    serializeMessageForClient,
    randomUUID,
    makeId,
    insertMessageRecord,
    toSqlDateTime,
    parseStoredMessageMeta,
    sendHttpsmsMessage,
    sanitizeStateMeta,
    updateMessageRecordState,
    publishMessageRealtimeUpdate,
    persistMessageNotification,
    verifyHttpsmsWebhookSignature,
    extractHttpsmsMessagePayload,
    HTTPSMS_FROM
  } = deps;

api.get("/messages/stream", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const context = getRequestUserContext(req);
  if (!hasRequestUserContext(context)) {
    return res.status(401).json({ ok: false, message: "Unauthorized. Missing user context headers." });
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  if (typeof req.socket?.setTimeout === "function") req.socket.setTimeout(0);

  const cleanup = registerMessageStreamClient(context.username, res);
  writeMessageStreamEvent(res, "ready", {
    type: "ready",
    transport: getMessageTransportMeta(),
    requestId: req.requestId || null
  });

  req.on("close", cleanup);
  req.on("end", cleanup);
}));

api.get("/messages/contacts", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const currentUser = findUserRecord(db, context.username);
  if (!currentUser) {
    return res.status(404).json({ ok: false, message: "Current user not found." });
  }

  const messageSummaries = await buildMessageContactSummaries(db, currentUser);
  const contacts = normalizeRecordCollection(db.users)
    .filter((user) => canMessageUser(context, user))
    .map((user) => {
      const summary = messageSummaries.get(clean(user?.id, 64)) || null;
      return {
        id: clean(user?.id, 64),
        username: clean(user?.username, 50),
        fullName: clean(user?.fullName, 90),
        role: toRole(user?.role),
        phone: clean(user?.phone, 30),
        smsPhone: normalizeSmsPhone(user?.phone),
        availabilityStatus: normalizeAvailabilityStatus(user?.availabilityStatus),
        accountStatus: normalizeAccountStatus(user?.accountStatus),
        lastMessage: clean(summary?.lastMessage, 240),
        lastMessageAt: toIso(summary?.lastMessageAt)
      };
    })
    .sort((a, b) => {
      const timeA = Date.parse(a.lastMessageAt || "");
      const timeB = Date.parse(b.lastMessageAt || "");
      const hasTimeA = Number.isFinite(timeA);
      const hasTimeB = Number.isFinite(timeB);
      if (hasTimeA && hasTimeB && timeA !== timeB) return timeB - timeA;
      if (hasTimeA !== hasTimeB) return hasTimeB - hasTimeA;
      return String(a.fullName || a.username).localeCompare(String(b.fullName || b.username));
    });

  return res.json({
    ok: true,
    data: contacts,
    meta: getLegacyMessageTransportMeta()
  });
}));

api.get("/messages", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const currentUser = findUserRecord(db, context.username);
  if (!currentUser) {
    return res.status(404).json({ ok: false, message: "Current user not found." });
  }

  const contactValue = clean(req.query?.contact || req.query?.with || "", 80);
  if (!contactValue) {
    return res.status(400).json({ ok: false, message: "contact is required." });
  }

  const contactUser = findUserRecord(db, contactValue);
  if (!contactUser || !canMessageUser(context, contactUser)) {
    return res.status(404).json({ ok: false, message: "Message contact not found or not allowed." });
  }

  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 200);
  const currentUserPhone = normalizeSmsPhone(currentUser?.phone);
  const contactUserPhone = normalizeSmsPhone(contactUser?.phone);
  const [rows] = await dbPool.query(
    `SELECT m.id, m.direction, m.channel, m.provider, m.provider_message_id, m.provider_status,
            m.sender_phone, m.recipient_phone, m.content, m.error_message, m.meta, m.read_at, m.created_at, m.updated_at,
            su.username AS sender_username, su.full_name AS sender_full_name, su.role AS sender_role,
            ru.username AS recipient_username, ru.full_name AS recipient_full_name, ru.role AS recipient_role
     FROM messages m
     LEFT JOIN users su ON su.id = m.sender_user_id
     LEFT JOIN users ru ON ru.id = m.recipient_user_id
       WHERE (
          (m.sender_user_id = ? AND m.recipient_user_id = ?)
          OR
          (m.sender_user_id = ? AND m.recipient_user_id = ?)
          OR
          (m.sender_phone = ? AND m.recipient_phone = ?)
          OR
          (m.sender_phone = ? AND m.recipient_phone = ?)
       )
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`,
      [currentUser.id, contactUser.id, contactUser.id, currentUser.id, currentUserPhone, contactUserPhone, contactUserPhone, currentUserPhone, limit]
    );

  const messages = rows
    .slice()
    .reverse()
    .map((row) => {
      const senderFallback = row.sender_username ? null : findUserByNormalizedPhone(db.users, row.sender_phone);
      const recipientFallback = row.recipient_username ? null : findUserByNormalizedPhone(db.users, row.recipient_phone);
      return serializeMessageForClient({
        id: row.id,
        direction: row.direction,
        channel: row.channel,
        provider: row.provider,
        providerMessageId: row.provider_message_id,
        providerStatus: row.provider_status,
        senderPhone: row.sender_phone,
        recipientPhone: row.recipient_phone,
        content: row.content,
        errorMessage: row.error_message,
        meta: row.meta,
        readAt: row.read_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        senderUsername: row.sender_username || senderFallback?.username,
        senderFullName: row.sender_full_name || senderFallback?.fullName,
        senderRole: row.sender_role || senderFallback?.role,
        recipientUsername: row.recipient_username || recipientFallback?.username,
        recipientFullName: row.recipient_full_name || recipientFallback?.fullName,
        recipientRole: row.recipient_role || recipientFallback?.role
      }, context);
    });

  return res.json({
    ok: true,
    data: messages,
    meta: {
      contact: {
        id: clean(contactUser?.id, 64),
        username: clean(contactUser?.username, 50),
        fullName: clean(contactUser?.fullName, 90),
        role: toRole(contactUser?.role),
        phone: clean(contactUser?.phone, 30),
        smsPhone: normalizeSmsPhone(contactUser?.phone)
      },
      ...getLegacyMessageTransportMeta()
    }
  });
}));

api.post("/messages", requireRole(["admin", "agent", "customer"]), asyncHandler(async (req, res) => {
  const db = await loadDb();
  const context = getRequestUserContext(req);
  const currentUser = findUserRecord(db, context.username);
  if (!currentUser) {
    return res.status(404).json({ ok: false, message: "Current user not found." });
  }

  const contactValue = clean(req.body?.contact || req.body?.to || req.body?.recipient || "", 80);
  const content = clean(req.body?.content || req.body?.message || "", 1500);
  if (!contactValue || !content) {
    return res.status(400).json({ ok: false, message: "contact and content are required." });
  }

  const contactUser = findUserRecord(db, contactValue);
  if (!contactUser || !canMessageUser(context, contactUser)) {
    return res.status(404).json({ ok: false, message: "Message contact not found or not allowed." });
  }

  const transport = getMessageTransportMeta();
  const senderPhone = normalizeSmsPhone(currentUser?.phone) || transport.senderPhone || "";
  const recipientPhone = normalizeSmsPhone(contactUser?.phone);
  const createdAt = new Date().toISOString();
  const requestId = req.requestId || randomUUID();
  const baseRecord = {
    id: makeId("MSG"),
    senderUserId: clean(currentUser?.id, 64),
    recipientUserId: clean(contactUser?.id, 64),
    direction: "outbound",
    channel: "app",
    provider: "internal",
    providerMessageId: "",
    providerStatus: "sent",
    senderPhone,
    recipientPhone,
    content,
    errorMessage: "",
    meta: {
      requestId,
      transport: "app"
    },
    createdAt
  };

  await insertMessageRecord(baseRecord);

  const responseRecord = {
    ...baseRecord,
    createdAt: toIso(toSqlDateTime(baseRecord.createdAt)) || baseRecord.createdAt,
    meta: parseStoredMessageMeta(baseRecord.meta)
  };
  let warning = "";

  if (transport.smsMirrorConfigured && recipientPhone) {
    try {
      const providerResult = await sendHttpsmsMessage({
        to: recipientPhone,
        content,
        requestId
      });
      responseRecord.providerMessageId = clean(providerResult?.providerMessageId, 128);
      responseRecord.meta = {
        ...responseRecord.meta,
        sms: {
          attempted: true,
          provider: "httpsms",
          providerMessageId: responseRecord.providerMessageId,
          status: clean(providerResult?.providerStatus, 30).toLowerCase() || "sent",
          errorMessage: "",
          senderPhone: transport.senderPhone,
          recipientPhone,
          providerResponse: sanitizeStateMeta(providerResult?.payload)
        }
      };
      await updateMessageRecordState({
        id: responseRecord.id,
        provider: responseRecord.provider,
        providerMessageId: responseRecord.providerMessageId,
        providerStatus: responseRecord.providerStatus,
        errorMessage: "",
        meta: responseRecord.meta
      });
    } catch (error) {
      const failedProviderMessageId = clean(
        error?.payload?.id || error?.payload?.message_id || error?.payload?.messageId || "",
        128
      );
      warning = clean(error?.message || "SMS mirror failed. The in-app message was still sent.", 240);
      responseRecord.providerMessageId = failedProviderMessageId;
      responseRecord.meta = {
        ...responseRecord.meta,
        sms: {
          attempted: true,
          provider: "httpsms",
          providerMessageId: failedProviderMessageId,
          status: "failed",
          errorMessage: warning,
          senderPhone: transport.senderPhone,
          recipientPhone,
          providerError: sanitizeStateMeta(error?.payload)
        }
      };
      await updateMessageRecordState({
        id: responseRecord.id,
        provider: responseRecord.provider,
        providerMessageId: responseRecord.providerMessageId,
        providerStatus: responseRecord.providerStatus,
        errorMessage: "",
        meta: responseRecord.meta
      });
    }
  } else if (transport.smsMirrorConfigured && !recipientPhone) {
    warning = "Message sent in-app. SMS mirroring was skipped because this contact has no valid phone number.";
    responseRecord.meta = {
      ...responseRecord.meta,
      sms: {
        attempted: false,
        provider: "httpsms",
        providerMessageId: "",
        status: "skipped_no_phone",
        errorMessage: "This contact does not have a valid SMS phone number.",
        senderPhone: transport.senderPhone,
        recipientPhone: ""
      }
    };
    await updateMessageRecordState({
      id: responseRecord.id,
      provider: responseRecord.provider,
      providerMessageId: "",
      providerStatus: responseRecord.providerStatus,
      errorMessage: "",
      meta: responseRecord.meta
    });
  }

  publishMessageRealtimeUpdate({
    eventType: "message_created",
    senderUser: currentUser,
    recipientUser: contactUser,
    messageLike: responseRecord
  });
  await persistMessageNotification({
    senderUser: currentUser,
    recipientUser: contactUser,
    messageLike: responseRecord,
    eventSource: "api"
  });

  return res.status(201).json({
    ok: true,
    data: serializeMessageForClient({
      ...responseRecord,
      senderUsername: currentUser.username,
      senderFullName: currentUser.fullName,
      senderRole: currentUser.role,
      recipientUsername: contactUser.username,
      recipientFullName: contactUser.fullName,
      recipientRole: contactUser.role
    }, context),
    meta: {
      ...getLegacyMessageTransportMeta(),
      ...(warning ? { warning } : {})
    }
  });
}));

api.post("/messages/webhooks/httpsms", asyncHandler(async (req, res) => {
  if (!verifyHttpsmsWebhookSignature(req)) {
    return res.status(401).json({ ok: false, message: "Invalid webhook signature." });
  }

  const payload = extractHttpsmsMessagePayload(req.body);
  if (!payload.eventType) {
    return res.status(202).json({ ok: true, ignored: true });
  }

  if (payload.eventType === "message.phone.received" && payload.from && payload.content) {
    const db = await loadDb();
    const senderUser = findUserByNormalizedPhone(db.users, payload.from);
    let recipientUser = null;

    const [recentRows] = await dbPool.query(
      `SELECT m.sender_user_id, m.recipient_user_id
       FROM messages m
       WHERE m.sender_phone = ? OR m.recipient_phone = ?
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 5`,
      [payload.from, payload.from]
    );

    for (const row of recentRows) {
      const senderId = clean(row?.sender_user_id, 64);
      const recipientId = clean(row?.recipient_user_id, 64);
      if (senderUser && recipientId && recipientId !== senderUser.id) {
        recipientUser = findUserRecord(db, recipientId);
        if (recipientUser) break;
      }
      if (senderUser && senderId && senderId !== senderUser.id) {
        recipientUser = findUserRecord(db, senderId);
        if (recipientUser) break;
      }
    }

    const inboundRecord = {
      id: makeId("MSG"),
      senderUserId: clean(senderUser?.id, 64),
      recipientUserId: clean(recipientUser?.id, 64),
      direction: "inbound",
      channel: "sms",
      provider: "httpsms",
      providerMessageId: payload.providerMessageId,
      providerStatus: "received",
      senderPhone: payload.from,
      recipientPhone: payload.to || normalizeSmsPhone(HTTPSMS_FROM),
      content: payload.content,
      meta: {
        eventType: payload.eventType,
        requestId: payload.requestId,
        raw: sanitizeStateMeta(payload.raw)
      },
      createdAt: payload.sentAt || new Date().toISOString()
    };
    await insertMessageRecord(inboundRecord);
    publishMessageRealtimeUpdate({
      eventType: "message_created",
      senderUser,
      recipientUser,
      messageLike: inboundRecord
    });
    await persistMessageNotification({
      senderUser,
      recipientUser,
      messageLike: inboundRecord,
      eventSource: "webhook"
    });
    return res.status(202).json({ ok: true, stored: true });
  }

  if (["message.phone.sent", "message.phone.delivered", "message.phone.send.failed", "message.phone.send.expired"].includes(payload.eventType) && payload.providerMessageId) {
    const mappedStatus =
      payload.eventType === "message.phone.delivered" ? "delivered" :
      payload.eventType === "message.phone.sent" ? "sent" :
      payload.eventType === "message.phone.send.expired" ? "expired" :
      "failed";

    const db = await loadDb();
    const [matchingRows] = await dbPool.query(
      `SELECT id, sender_user_id, recipient_user_id, channel, provider, provider_message_id, provider_status, sender_phone, recipient_phone, content, error_message, meta, read_at, created_at, updated_at
       FROM messages
       WHERE provider_message_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [payload.providerMessageId]
    );

    for (const row of matchingRows) {
      const channel = clean(row?.channel, 20).toLowerCase() || "sms";
      if (channel === "app") {
        const nextMeta = parseStoredMessageMeta(row?.meta);
        const existingSmsMeta = parseStoredMessageMeta(nextMeta.sms);
        nextMeta.sms = {
          ...existingSmsMeta,
          attempted: true,
          provider: "httpsms",
          providerMessageId: payload.providerMessageId,
          status: mappedStatus,
          errorMessage: mappedStatus === "failed" ? clean(payload.content || payload.status || "Delivery failed.", 500) : ""
        };
        await updateMessageRecordState({
          id: row.id,
          provider: clean(row?.provider, 30) || "internal",
          providerMessageId: payload.providerMessageId,
          providerStatus: clean(row?.provider_status, 30) || "sent",
          errorMessage: "",
          meta: nextMeta
        });
        publishMessageRealtimeUpdate({
          eventType: "message_status_updated",
          senderUser: findUserRecord(db, clean(row?.sender_user_id, 64)),
          recipientUser: findUserRecord(db, clean(row?.recipient_user_id, 64)),
          messageLike: {
            id: row.id,
            direction: "outbound",
            channel,
            provider: clean(row?.provider, 30) || "internal",
            providerMessageId: payload.providerMessageId,
            providerStatus: clean(row?.provider_status, 30) || "sent",
            senderPhone: row.sender_phone,
            recipientPhone: row.recipient_phone,
            content: row.content,
            errorMessage: row.error_message,
            meta: nextMeta,
            readAt: row.read_at,
            createdAt: row.created_at,
            updatedAt: new Date().toISOString()
          }
        });
        continue;
      }

      await updateMessageRecordState({
        id: row.id,
        provider: clean(row?.provider, 30) || "httpsms",
        providerMessageId: payload.providerMessageId,
        providerStatus: mappedStatus,
        errorMessage: mappedStatus === "failed" ? clean(payload.content || payload.status || "Delivery failed.", 500) : "",
        meta: parseStoredMessageMeta(row?.meta)
      });
    }
  }

  return res.status(202).json({ ok: true, stored: false });
}));

};