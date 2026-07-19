/**
 * phone kotoba — kotoba-E2E split for the browser softphone
 * (phone.etzhayyim.com, AWS Connect WebRTC CCP).
 *
 * Per ADR-2606011400 (Consensys product-front / infra-back) + ADR-2605172400
 * (3-axis Liability/Custody/Settlement) + ADR-2605181100 (kotoba E2E
 * encrypted-record envelope). Founder directive 2026-06-03: MAXIMAL migration —
 * front everything that can move; only the irreducible regulated telephony
 * EXECUTION stays etzhayyim.
 *
 * SPLIT:
 *   PUBLIC (plaintext AT records) — no-PII org metadata + aggregate read-views:
 *     • queueDirectory  — queue / extension reference catalog (org-level, no
 *       per-person data): queue label, channel, routing tier.
 *     • callVolumeStat  — aggregate call-volume projection by disposition
 *       (counts only, no caller/callee identity). Frontable open metadata; the
 *       intel coverageProjection analog that feeds the coverage rollup.
 *
 *   SENSITIVE PII / CDR (kotoba E2E, com.etzhayyim.encrypted.record) —
 *     • contact     — per-person PII (display name, phone numbers, tags). Sealed
 *       via sdk.encryptedWrite; read-cap = owner DID + explicit recipients.
 *     • callRecord  — call-detail record / message-metadata (caller, callee,
 *       duration, disposition, channel incl. webrtc-widget). E2E per the
 *       message-metadata rule. The CDR DATA migrates encrypted; the carrier call
 *       EXECUTION stays etzhayyim.
 *
 *   STAYS etzhayyim (note, NOT a collection — consumed via consent-capability) — the
 *   irreducible regulated telephony EXECUTION + credential custody: AWS Connect
 *   StartOutboundVoiceContact / PSTN origination + termination / StartWebRTCContact
 *   media, Amazon Chime SDK voice, CCP + SAML token custody, and S3
 *   call-recording custody. We migrate the CDR/contact DATA E2E; the regulated
 *   carrier call ACT and recording custody remain etzhayyim-resident.
 *
 * AT-Lexicon: no float — durations are integer seconds; any percent is integer
 * 0-100. No money field exists on this app (the fiat telephony charge is part of
 * the etzhayyim carrier-rail execution, never a record here).
 */

// ─── Plaintext collections (public, no PII) ─────────────────────────
export const QUEUE_DIRECTORY_COLLECTION = "com.etzhayyim.apps.phone.queueDirectory";
export const CALL_VOLUME_STAT_COLLECTION = "com.etzhayyim.apps.phone.callVolumeStat";

// ─── E2E inner-type NSIDs (body shape inside the encrypted envelope) ─
export const CONTACT_INNER_TYPE = "com.etzhayyim.apps.phone.contact";
export const CALL_RECORD_INNER_TYPE = "com.etzhayyim.apps.phone.callRecord";

export const PHONE_DID_PREFIX = "did:web:phone.etzhayyim.com:" as const;

export type CallChannel = "pstn" | "extension" | "webrtcWidget";
export type CallDirection = "inbound" | "outbound";
export type CallDisposition = "answered" | "missed" | "abandoned" | "voicemail" | "transferred";

// ─── Queue directory (PLAINTEXT, org reference catalog) ─────────────

export interface QueueDirectoryRecord {
  did: string;
  queueId: string;
  label: string;
  channel: CallChannel;
  /** Routing tier 0-100 (integer; higher = higher priority). */
  routingTier: number;
  createdAt: string;
}
export interface QueueDirectoryView extends QueueDirectoryRecord {
  queueUri: string;
}
export interface RegisterQueueInput {
  queueId: string;
  label: string;
  channel: CallChannel;
  routingTier?: number;
}
export interface RegisterQueueOutput {
  status: "registered" | "alreadyExists" | "rejected";
  queueUri?: string;
  did?: string;
  queueId?: string;
  error?: string;
}
export interface ListQueuesInput {
  channel?: CallChannel;
  limit?: number;
  cursor?: string;
}
export interface ListQueuesOutput {
  items: QueueDirectoryView[];
  cursor?: string;
  total: number;
}

// ─── Call-volume stat (PLAINTEXT, aggregate, no identity) ───────────

export interface CallVolumeStatRecord {
  did: string;
  statId: string;
  disposition: CallDisposition;
  /** Aggregate count of calls with this disposition (integer >= 0). */
  callCount: number;
  /** Reporting window (e.g. "2026-06-03" or "2026-W23"). */
  window: string;
  createdAt: string;
}
export interface CallVolumeStatView extends CallVolumeStatRecord {
  statUri: string;
}
export interface RecordVolumeStatInput {
  statId: string;
  disposition: CallDisposition;
  callCount: number;
  window: string;
}
export interface RecordVolumeStatOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  statUri?: string;
  did?: string;
  statId?: string;
  error?: string;
}
export interface ListVolumeStatsInput {
  disposition?: CallDisposition;
  limit?: number;
  cursor?: string;
}
export interface ListVolumeStatsOutput {
  items: CallVolumeStatView[];
  cursor?: string;
  total: number;
}

// ─── Contact (E2E-ENCRYPTED, per-person PII) ────────────────────────

export interface ContactBody {
  contactId: string;
  displayName: string;
  /** PII — sealed in the E2E envelope, never plaintext on substrate. */
  phoneNumbers: string[];
  tags: string[];
  notedAt: string;
}
export interface ContactView extends ContactBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface SaveContactInput {
  contactId: string;
  displayName: string;
  phoneNumbers: string[];
  tags?: string[];
  notedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface SaveContactOutput {
  status: "saved" | "rejected";
  uri?: string;
  keyId?: string;
  contactId?: string;
  error?: string;
}
export interface ListContactsInput {
  tag?: string;
  limit?: number;
  cursor?: string;
}
export interface ListContactsOutput {
  items: ContactView[];
  cursor?: string;
  total: number;
}
export interface GetContactInput {
  contactId: string;
}
export interface GetContactOutput {
  contact?: ContactView;
  error?: string;
}

// ─── Call record / CDR (E2E-ENCRYPTED, message-metadata + PII) ──────

export interface CallRecordBody {
  callId: string;
  direction: CallDirection;
  channel: CallChannel;
  /** Caller identity (PII / message-metadata) — sealed E2E. */
  caller: string;
  /** Callee identity (PII / message-metadata) — sealed E2E. */
  callee: string;
  /** Integer seconds (no float). */
  durationSec: number;
  disposition: CallDisposition;
  occurredAt: string;
}
export interface CallRecordView extends CallRecordBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface LogCallInput {
  callId: string;
  direction: CallDirection;
  channel: CallChannel;
  caller: string;
  callee: string;
  durationSec: number;
  disposition: CallDisposition;
  occurredAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface LogCallOutput {
  status: "logged" | "rejected";
  uri?: string;
  keyId?: string;
  callId?: string;
  error?: string;
}
export interface ListCallsInput {
  disposition?: CallDisposition;
  channel?: CallChannel;
  limit?: number;
  cursor?: string;
}
export interface ListCallsOutput {
  items: CallRecordView[];
  cursor?: string;
  total: number;
}
export interface GetCallInput {
  callId: string;
}
export interface GetCallOutput {
  call?: CallRecordView;
  error?: string;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  queueDirectoryCount?: number;
  callVolumeStatCount?: number;
  contactCount?: number;
  callRecordCount?: number;
  statsByDisposition?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
const CHANNELS: readonly CallChannel[] = ["pstn", "extension", "webrtcWidget"];
const DIRECTIONS: readonly CallDirection[] = ["inbound", "outbound"];
const DISPOSITIONS: readonly CallDisposition[] = ["answered", "missed", "abandoned", "voicemail", "transferred"];
export function isChannel(v: unknown): v is CallChannel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}
export function isDirection(v: unknown): v is CallDirection {
  return typeof v === "string" && (DIRECTIONS as readonly string[]).includes(v);
}
export function isDisposition(v: unknown): v is CallDisposition {
  return typeof v === "string" && (DISPOSITIONS as readonly string[]).includes(v);
}
export function queueDidFor(id: string): string {
  return `${PHONE_DID_PREFIX}q:${id.toLowerCase()}`;
}
export function statDidFor(id: string): string {
  return `${PHONE_DID_PREFIX}stat:${id.toLowerCase()}`;
}
function slug(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
export function queueRkey(id: string): string {
  return `queue-${slug(id)}`;
}
export function statRkey(id: string): string {
  return `stat-${slug(id)}`;
}
export function contactRkey(id: string): string {
  return `contact-${slug(id)}`;
}
export function callRkey(id: string): string {
  return `call-${slug(id)}`;
}
