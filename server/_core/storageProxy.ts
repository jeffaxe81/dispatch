import type { Express } from "express";
import { assertCanReadIncident } from "../authorization";
import { assertPermission, assertTeamScope } from "../accessControl";
import { getStoredObjectAuthorization } from "../db";
import { storageGetSignedUrl } from "../storage";
import { authenticateLocalRequest } from "../localAuth";

const PUBLIC_STORAGE_KEYS = new Set(["axe-sistemas-viking-mark_2bb3ebce.png"]);

export function isPublicStorageKey(key: string) {
  return PUBLIC_STORAGE_KEYS.has(key);
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0]?.replace(/^\/+/, "");
    if (!key || key.includes("..") || key.includes("\\")) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      if (!isPublicStorageKey(key)) {
        const user = await authenticateLocalRequest(req).catch(() => null);
        if (!user) {
          res.status(401).send("Authentication required");
          return;
        }
        const owner = await getStoredObjectAuthorization(key);
        if (!owner) {
          res.status(404).send("Storage object not found");
          return;
        }
        if (owner.kind === "profile_photo") {
          if (owner.ownerUserId !== user.id) {
            res.status(403).send("Storage object unavailable");
            return;
          }
        } else {
          await assertPermission(user, "occurrences.view");
          if (owner.incident.assignedTeamId) {
            await assertTeamScope(user, owner.incident.assignedTeamId, "occurrences.view");
          }
          assertCanReadIncident(user, owner.incident);
        }
      }
      const url = await storageGetSignedUrl(key);

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(403).send("Storage object unavailable");
    }
  });
}
