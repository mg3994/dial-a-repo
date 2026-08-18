import { describe, expect, it } from "vitest";
import { SchemaValidator } from "../googlekit/src/schema/validator";
import { executeMcpTool } from "../googlekit/src/mcp/tools";

describe("GoogleKit Suite", () => {
  it("validates Schema.org Product and Organization nodes", () => {
    expect(SchemaValidator.isProduct({ "@type": "Product", name: "Camera" })).toBe(true);
    expect(SchemaValidator.isOrganization({ "@type": "Store", name: "My Shop" })).toBe(true);
  });

  it("executes googlekit MCP tools", async () => {
    const res = await executeMcpTool({
      name: "mcp_get_order_details",
      arguments: { orderId: "ORD-771" },
    });

    expect(res.status).toBe("success");
    expect(res.data.orderId).toBe("ORD-771");
  });
});
