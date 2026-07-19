/**
 * phone kotoba — kotoba-E2E registry for the browser softphone.
 *
 * Plaintext path (queueDirectory / callVolumeStat): sdk.write / sdk.read —
 * public org metadata + aggregate read-views, no caller/callee identity.
 *
 * E2E path (contact / callRecord): sdk.encryptedWrite / sdk.encryptedRead — PII
 * + CDR bodies sealed in the kotoba envelope (ADR-2605181100), read-cap = owner
 * DID + explicit recipients. The substrate never sees a phone number or
 * caller/callee identity in plaintext.
 *
 * The regulated telephony EXECUTION (AWS Connect StartOutboundVoiceContact /
 * StartWebRTCContact media, Amazon Chime SDK voice, CCP + SAML token custody,
 * S3 recording custody) stays etzhayyim and is consumed via consent-capability —
 * never implemented here.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  CALL_RECORD_INNER_TYPE,
  CALL_VOLUME_STAT_COLLECTION,
  CONTACT_INNER_TYPE,
  QUEUE_DIRECTORY_COLLECTION,
  callRkey,
  contactRkey,
  isChannel,
  isDirection,
  isDisposition,
  isPct,
  isUint,
  queueDidFor,
  queueRkey,
  statDidFor,
  statRkey,
  type CallRecordBody,
  type CallRecordView,
  type CallVolumeStatRecord,
  type CallVolumeStatView,
  type ContactBody,
  type ContactView,
  type CoverageInput,
  type CoverageOutput,
  type GetCallInput,
  type GetCallOutput,
  type GetContactInput,
  type GetContactOutput,
  type ListCallsInput,
  type ListCallsOutput,
  type ListContactsInput,
  type ListContactsOutput,
  type ListQueuesInput,
  type ListQueuesOutput,
  type ListVolumeStatsInput,
  type ListVolumeStatsOutput,
  type LogCallInput,
  type LogCallOutput,
  type QueueDirectoryRecord,
  type QueueDirectoryView,
  type RegisterQueueInput,
  type RegisterQueueOutput,
  type RecordVolumeStatInput,
  type RecordVolumeStatOutput,
  type SaveContactInput,
  type SaveContactOutput,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── Queue directory (PLAINTEXT) ────────────────────────────────────

export async function registerQueue(e: Etzhayyim, input: RegisterQueueInput): Promise<RegisterQueueOutput> {
  if (!input.queueId || !input.label) return { status: "rejected", error: "missingRequiredFields" };
  if (!isChannel(input.channel)) return { status: "rejected", error: "invalidChannel" };
  if (input.routingTier !== undefined && !isPct(input.routingTier)) return { status: "rejected", error: "invalidRoutingTier" };
  const rkey = queueRkey(input.queueId);
  const existing = await e.read<QueueDirectoryRecord>({ collection: QUEUE_DIRECTORY_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", queueUri: existing.records[0].uri, did: existing.records[0].value.did, queueId: input.queueId };
  }
  const now = new Date().toISOString();
  const did = queueDidFor(input.queueId);
  const record: QueueDirectoryRecord = {
    did,
    queueId: input.queueId,
    label: input.label,
    channel: input.channel,
    routingTier: input.routingTier ?? 0,
    createdAt: now,
  };
  const receipt = await e.write({ collection: QUEUE_DIRECTORY_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", queueUri: receipt.uri, did, queueId: input.queueId };
}

export async function listQueues(e: Etzhayyim, input: ListQueuesInput = {}): Promise<ListQueuesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<QueueDirectoryRecord>({ collection: QUEUE_DIRECTORY_COLLECTION, cursor: input.cursor, limit });
  const items: QueueDirectoryView[] = resp.records
    .filter((r) => !input.channel || r.value.channel === input.channel)
    .map((r) => ({ ...r.value, queueUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Call-volume stat (PLAINTEXT aggregate) ─────────────────────────

export async function recordVolumeStat(e: Etzhayyim, input: RecordVolumeStatInput): Promise<RecordVolumeStatOutput> {
  if (!input.statId || !input.window) return { status: "rejected", error: "missingRequiredFields" };
  if (!isDisposition(input.disposition)) return { status: "rejected", error: "invalidDisposition" };
  if (!isUint(input.callCount)) return { status: "rejected", error: "invalidCallCount" };
  const rkey = statRkey(input.statId);
  const existing = await e.read<CallVolumeStatRecord>({ collection: CALL_VOLUME_STAT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", statUri: existing.records[0].uri, did: existing.records[0].value.did, statId: input.statId };
  }
  const now = new Date().toISOString();
  const did = statDidFor(input.statId);
  const record: CallVolumeStatRecord = {
    did,
    statId: input.statId,
    disposition: input.disposition,
    callCount: input.callCount,
    window: input.window,
    createdAt: now,
  };
  const receipt = await e.write({ collection: CALL_VOLUME_STAT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", statUri: receipt.uri, did, statId: input.statId };
}

export async function listVolumeStats(e: Etzhayyim, input: ListVolumeStatsInput = {}): Promise<ListVolumeStatsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<CallVolumeStatRecord>({ collection: CALL_VOLUME_STAT_COLLECTION, cursor: input.cursor, limit });
  const items: CallVolumeStatView[] = resp.records
    .filter((r) => !input.disposition || r.value.disposition === input.disposition)
    .map((r) => ({ ...r.value, statUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Contact (E2E-ENCRYPTED, PII) ───────────────────────────────────

export async function saveContact(e: Etzhayyim, input: SaveContactInput): Promise<SaveContactOutput> {
  if (!input.contactId || !input.displayName) return { status: "rejected", error: "missingRequiredFields" };
  if (!Array.isArray(input.phoneNumbers) || input.phoneNumbers.length === 0) return { status: "rejected", error: "invalidPhoneNumbers" };
  const body: ContactBody = {
    contactId: input.contactId,
    displayName: input.displayName,
    phoneNumbers: input.phoneNumbers,
    tags: input.tags ?? [],
    notedAt: input.notedAt ?? new Date().toISOString(),
  };
  // Read-cap = owner DID (sender, auto-wrapped) + any explicit recipients.
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: CONTACT_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: contactRkey(input.contactId),
  });
  return { status: "saved", uri: receipt.uri, keyId: receipt.keyId, contactId: input.contactId };
}

async function scanContacts(e: Etzhayyim, maxScan: number): Promise<ContactView[]> {
  const out: ContactView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<ContactBody>({ innerType: CONTACT_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listContacts(e: Etzhayyim, input: ListContactsInput = {}): Promise<ListContactsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanContacts(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((c) => !input.tag || c.tags.includes(input.tag));
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getContact(e: Etzhayyim, input: GetContactInput): Promise<GetContactOutput> {
  if (!input.contactId) return { error: "invalidContactId" };
  const all = await scanContacts(e, DEFAULT_MAX_SCAN);
  const found = all.find((c) => c.contactId === input.contactId);
  if (!found) return { error: "notFound" };
  return { contact: found };
}

// ─── Call record / CDR (E2E-ENCRYPTED, message-metadata) ────────────

export async function logCall(e: Etzhayyim, input: LogCallInput): Promise<LogCallOutput> {
  if (!input.callId || !input.caller || !input.callee) return { status: "rejected", error: "missingRequiredFields" };
  if (!isDirection(input.direction)) return { status: "rejected", error: "invalidDirection" };
  if (!isChannel(input.channel)) return { status: "rejected", error: "invalidChannel" };
  if (!isDisposition(input.disposition)) return { status: "rejected", error: "invalidDisposition" };
  if (!isUint(input.durationSec)) return { status: "rejected", error: "invalidDurationSec" };
  const body: CallRecordBody = {
    callId: input.callId,
    direction: input.direction,
    channel: input.channel,
    caller: input.caller,
    callee: input.callee,
    durationSec: input.durationSec,
    disposition: input.disposition,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: CALL_RECORD_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: callRkey(input.callId),
  });
  return { status: "logged", uri: receipt.uri, keyId: receipt.keyId, callId: input.callId };
}

async function scanCalls(e: Etzhayyim, maxScan: number): Promise<CallRecordView[]> {
  const out: CallRecordView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<CallRecordBody>({ innerType: CALL_RECORD_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listCalls(e: Etzhayyim, input: ListCallsInput = {}): Promise<ListCallsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanCalls(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter(
    (c) => (!input.disposition || c.disposition === input.disposition) && (!input.channel || c.channel === input.channel),
  );
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getCall(e: Etzhayyim, input: GetCallInput): Promise<GetCallOutput> {
  if (!input.callId) return { error: "invalidCallId" };
  const all = await scanCalls(e, DEFAULT_MAX_SCAN);
  const found = all.find((c) => c.callId === input.callId);
  if (!found) return { error: "notFound" };
  return { call: found };
}

// ─── Coverage rollup ────────────────────────────────────────────────

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const statsByDisposition: Record<string, number> = {};

  let queueDirectoryCount = 0;
  let qCursor: string | undefined;
  while (queueDirectoryCount < maxScan) {
    const page = await e.read<QueueDirectoryRecord>({ collection: QUEUE_DIRECTORY_COLLECTION, cursor: qCursor, limit: PAGE_LIMIT });
    queueDirectoryCount += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    qCursor = page.cursor;
  }

  let callVolumeStatCount = 0;
  let sCursor: string | undefined;
  while (callVolumeStatCount < maxScan) {
    const page = await e.read<CallVolumeStatRecord>({ collection: CALL_VOLUME_STAT_COLLECTION, cursor: sCursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      statsByDisposition[r.value.disposition] = (statsByDisposition[r.value.disposition] ?? 0) + 1;
      callVolumeStatCount += 1;
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    sCursor = page.cursor;
  }

  const contactCount = (await scanContacts(e, maxScan)).length;
  const callRecordCount = (await scanCalls(e, maxScan)).length;

  return {
    queueDirectoryCount,
    callVolumeStatCount,
    contactCount,
    callRecordCount,
    statsByDisposition,
    truncated:
      queueDirectoryCount >= maxScan ||
      callVolumeStatCount >= maxScan ||
      contactCount >= maxScan ||
      callRecordCount >= maxScan,
  };
}
