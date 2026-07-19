/**
 * phone kotoba — barrel. kotoba-E2E split for the browser softphone:
 * plaintext queue directory + aggregate call-volume stats (public, no PII) +
 * kotoba-E2E contact PII and CDRs (ADR-2605181100). The regulated telephony
 * EXECUTION + recording custody stay etzhayyim via consent-capability.
 */
export * from "./types.js";
export {
  registerQueue,
  listQueues,
  recordVolumeStat,
  listVolumeStats,
  saveContact,
  listContacts,
  getContact,
  logCall,
  listCalls,
  getCall,
  coverage,
} from "./registry.js";
