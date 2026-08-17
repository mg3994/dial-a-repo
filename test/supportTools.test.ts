import { describe, expect, it } from "vitest";
import { SchemaValidator } from "../support-on-call/src/schema/validator";
import { executeMcpTool } from "../support-on-call/src/mcp/tools";

describe("SchemaValidator & MCP Tools", () => {
  it("correctly identifies Schema.org Product nodes", () => {
    expect(SchemaValidator.isProduct({ "@type": "Product", name: "Shirt" })).toBe(true);
    expect(SchemaValidator.isProduct({ "@type": "ProductGroup", name: "Shirts" })).toBe(true);
    expect(SchemaValidator.isProduct({ "@type": "Article" })).toBe(false);
  });

  it("extracts offer details correctly", () => {
    const node = {
      offers: {
        price: 49.99,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    };
    const details = SchemaValidator.extractOfferDetails(node);
    expect(details).toEqual({
      price: 49.99,
      currency: "USD",
      available: true,
    });
  });

  it("executes mcp_get_order_details tool", async () => {
    const result = await executeMcpTool({
      name: "mcp_get_order_details",
      arguments: { orderId: "ORD-991" },
    });

    expect(result.status).toBe("success");
    expect(result.data.orderId).toBe("ORD-991");
    expect(result.data.status).toBe("SHIPPED");
  });

  it("executes mcp_trigger_refund tool", async () => {
    const result = await executeMcpTool({
      name: "mcp_trigger_refund",
      arguments: { orderId: "ORD-991", reason: "Damaged item" },
    });

    expect(result.status).toBe("success");
    expect(result.data.status).toBe("PROCESSING");
  });
});
