import { describe, expect, it } from "vitest";
import { discoverListingUrlsFromHtml } from "./discoverUrls.js";

describe("discoverListingUrlsFromHtml", () => {
  it("extrait les liens SeLoger", () => {
    const html = `
      <a href="/annonces/locations/appartement-paris-18eme-75/123456789.htm">A</a>
      <a href="/recherche">Search</a>
    `;
    const urls = discoverListingUrlsFromHtml(
      html,
      "https://www.seloger.com/list.htm?projects=1",
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("123456789.htm");
  });

  it("extrait les liens Leboncoin", () => {
    const html = `<a href="https://www.leboncoin.fr/ad/locations/1234567890">A</a>`;
    const urls = discoverListingUrlsFromHtml(html, "https://www.leboncoin.fr/recherche");
    expect(urls[0]).toContain("/ad/locations/");
  });
});
