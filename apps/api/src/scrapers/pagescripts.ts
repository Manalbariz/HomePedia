import type { ComparedListing } from "./types.js";
import { extractNextDataObject } from "./nextdata.js";

/**
 * Scans inline <script> content (already extracted by Playwright page.evaluate)
 * for known window.* variable assignments that might contain listing data.
 */

const KNOWN_VARS = [
  "__INITIAL_STATE__",
  "__PRELOADED_STATE__",
  "__SERVER_SIDE_PROPS__",
  "__STORE__",
  "__REDUX_STATE__",
  "__STATE__",
  "SELOGER_DATA",
  "__APP_STATE__",
];

type JsonObj = Record<string, unknown>;

function safeJsonParse(s: string): JsonObj | null {
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : null;
  } catch {
    return null;
  }
}

/**
 * Given all inline scripts from the page (extracted via Playwright),
 * look for known window variable assignments and try to extract listing data.
 */
export function extractFromWindowVars(
  scripts: string[],
  hostname: string
): Partial<ComparedListing> {
  for (const script of scripts) {
    for (const varName of KNOWN_VARS) {
      // Match: window.__VAR__ = {...}; or window["__VAR__"] = {...};
      const pattern = new RegExp(
        `window(?:\\["${varName}"\\]|\\.__${varName.replace(/^__/, "").replace(/__$/, "")}__)\\s*=\\s*(\\{[\\s\\S]+?\\});?\\s*(?:window|$)`,
        "m"
      );
      const match = script.match(pattern);
      if (match) {
        const data = safeJsonParse(match[1]);
        if (data) {
          // Try to extract using site-specific logic first, then generic
          const extracted = extractNextDataObject(data, hostname);
          if (Object.keys(extracted).length > 0) return extracted;
        }
      }
    }
  }
  return {};
}
