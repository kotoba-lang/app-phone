import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
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
} from "../src/index.js";

const OWNER = "did:web:phone.etzhayyim.com";

describe("phone kotoba (kotoba-E2E softphone split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("queueDirectory (PLAINTEXT public catalog)", () => {
    it("registers, dedups, validates, lists/filters by channel", async () => {
      expect((await registerQueue(e, { queueId: "q1", label: "Sales", channel: "pstn", routingTier: 80 })).status).toBe("registered");
      expect((await registerQueue(e, { queueId: "q1", label: "Sales", channel: "pstn" })).status).toBe("alreadyExists");
      expect((await registerQueue(e, { queueId: "qX", label: "Bad", channel: "carrier-pigeon" as any })).status).toBe("rejected");
      expect((await registerQueue(e, { queueId: "qY", label: "Bad", channel: "pstn", routingTier: 200 })).status).toBe("rejected");
      await registerQueue(e, { queueId: "q2", label: "Support", channel: "webrtcWidget", routingTier: 50 });
      expect((await listQueues(e)).total).toBe(2);
      expect((await listQueues(e, { channel: "webrtcWidget" })).total).toBe(1);
    });
  });

  describe("callVolumeStat (PLAINTEXT aggregate, no identity)", () => {
    it("records, dedups, validates, lists/filters by disposition", async () => {
      expect((await recordVolumeStat(e, { statId: "s1", disposition: "answered", callCount: 120, window: "2026-W23" })).status).toBe("recorded");
      expect((await recordVolumeStat(e, { statId: "s1", disposition: "answered", callCount: 120, window: "2026-W23" })).status).toBe("alreadyExists");
      expect((await recordVolumeStat(e, { statId: "sX", disposition: "answered", callCount: -1, window: "w" })).status).toBe("rejected");
      expect((await recordVolumeStat(e, { statId: "sY", disposition: "nope" as any, callCount: 1, window: "w" })).status).toBe("rejected");
      await recordVolumeStat(e, { statId: "s2", disposition: "missed", callCount: 30, window: "2026-W23" });
      expect((await listVolumeStats(e)).total).toBe(2);
      expect((await listVolumeStats(e, { disposition: "missed" })).total).toBe(1);
    });
  });

  describe("contact (E2E-ENCRYPTED PII)", () => {
    it("seals via encryptedWrite, round-trips via encryptedRead, validates", async () => {
      const ok = await saveContact(e, { contactId: "c1", displayName: "Alice", phoneNumbers: ["+15550001111"], tags: ["vip"] });
      expect(ok.status).toBe("saved");
      expect(ok.keyId).toBeTruthy();
      expect(ok.uri).toContain("com.etzhayyim.encrypted.record");
      expect((await saveContact(e, { contactId: "cX", displayName: "NoNum", phoneNumbers: [] })).status).toBe("rejected");
      const got = await getContact(e, { contactId: "c1" });
      expect(got.contact?.displayName).toBe("Alice");
      expect(got.contact?.phoneNumbers).toEqual(["+15550001111"]);
      await saveContact(e, { contactId: "c2", displayName: "Bob", phoneNumbers: ["+15550002222"], tags: ["lead"] });
      expect((await listContacts(e)).total).toBe(2);
      expect((await listContacts(e, { tag: "vip" })).total).toBe(1);
      expect((await getContact(e, { contactId: "missing" })).error).toBe("notFound");
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the contact", async () => {
      await saveContact(e, { contactId: "c1", displayName: "Alice", phoneNumbers: ["+15550001111"] });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listContacts(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient (owner still reads)", async () => {
      const partner = "did:web:partner.example";
      const r = await saveContact(e, { contactId: "c1", displayName: "Alice", phoneNumbers: ["+15550001111"], recipients: [partner] });
      expect(r.status).toBe("saved");
      expect((await listContacts(e)).total).toBe(1);
    });
  });

  describe("callRecord / CDR (E2E-ENCRYPTED message-metadata)", () => {
    it("seals via encryptedWrite, round-trips, validates, filters by channel/disposition", async () => {
      const ok = await logCall(e, {
        callId: "call1",
        direction: "outbound",
        channel: "pstn",
        caller: "+15550001111",
        callee: "+15550009999",
        durationSec: 142,
        disposition: "answered",
      });
      expect(ok.status).toBe("logged");
      expect(ok.keyId).toBeTruthy();
      expect((await logCall(e, { callId: "cX", direction: "x" as any, channel: "pstn", caller: "a", callee: "b", durationSec: 1, disposition: "answered" })).status).toBe("rejected");
      expect((await logCall(e, { callId: "cY", direction: "inbound", channel: "pstn", caller: "a", callee: "b", durationSec: -5, disposition: "answered" })).status).toBe("rejected");
      const got = await getCall(e, { callId: "call1" });
      expect(got.call?.callee).toBe("+15550009999");
      expect(got.call?.durationSec).toBe(142);
      await logCall(e, { callId: "call2", direction: "inbound", channel: "webrtcWidget", caller: "guest", callee: "agent", durationSec: 30, disposition: "missed" });
      expect((await listCalls(e)).total).toBe(2);
      expect((await listCalls(e, { channel: "webrtcWidget" })).total).toBe(1);
      expect((await listCalls(e, { disposition: "answered" })).total).toBe(1);
    });

    it("isolates CDRs by owner DID", async () => {
      await logCall(e, { callId: "call1", direction: "outbound", channel: "pstn", caller: "+1", callee: "+2", durationSec: 10, disposition: "answered" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listCalls(outsider)).total).toBe(0);
    });
  });

  describe("coverage rollup", () => {
    it("counts plaintext catalog/stats + E2E contacts + CDRs", async () => {
      await registerQueue(e, { queueId: "q1", label: "Sales", channel: "pstn" });
      await recordVolumeStat(e, { statId: "s1", disposition: "answered", callCount: 10, window: "w" });
      await recordVolumeStat(e, { statId: "s2", disposition: "answered", callCount: 20, window: "w" });
      await saveContact(e, { contactId: "c1", displayName: "Alice", phoneNumbers: ["+1"] });
      await logCall(e, { callId: "call1", direction: "outbound", channel: "pstn", caller: "+1", callee: "+2", durationSec: 5, disposition: "answered" });
      const cov = await coverage(e);
      expect(cov.queueDirectoryCount).toBe(1);
      expect(cov.callVolumeStatCount).toBe(2);
      expect(cov.contactCount).toBe(1);
      expect(cov.callRecordCount).toBe(1);
      expect(cov.statsByDisposition?.answered).toBe(2);
      expect(cov.truncated).toBe(false);
    });
  });
});
