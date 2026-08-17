import { describe, expect, it } from "vitest";
import { BloggerDataService, SchemaOverride } from "../support-on-call/src/schema/blogger";

describe("SchemaOverride & BloggerDataService", () => {
  it("resolves @id values correctly", () => {
    expect(SchemaOverride.resolveId("blog1/post1", "https://schema.org/Product")).toEqual({
      url: "https://schema.org/Product",
    });
    expect(SchemaOverride.resolveId("blog1/post1", "blog2/post2")).toEqual({
      blogId: "blog2",
      postId: "post2",
    });
  });

  it("extracts JSON-LD from content string with script tags", () => {
    const service = new BloggerDataService();
    const content = `<div>Some HTML</div><script type="application/ld+json">{"@type": "Product", "name": "Test Shirt"}</script>`;
    const parsed = service.extractJsonLd(content);
    expect(parsed).toEqual({ "@type": "Product", name: "Test Shirt" });
  });

  it("deep merges target and source schemas", () => {
    const target = { "@type": "Product", name: "Shirt", offers: { price: 10 } };
    const source = { offers: { priceCurrency: "USD" } };
    const merged = SchemaOverride.deepMerge(target, source);
    expect(merged).toEqual({
      "@type": "Product",
      name: "Shirt",
      offers: { price: 10, priceCurrency: "USD" },
    });
  });
});
