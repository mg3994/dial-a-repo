import { BloggerDataService } from "../schema/blogger";
import { SchemaValidator } from "../schema/validator";

export interface McpToolRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface McpToolResult {
  tool: string;
  status: "success" | "error";
  data?: any;
  error?: string;
}

export const ECOMMERCE_MCP_TOOLS = [
  {
    name: "mcp_get_order_details",
    description: "Fetches order status, items, tracking info, and payment breakdown.",
    parameters: {
      type: "OBJECT",
      properties: {
        orderId: { type: "STRING", description: "Order ID." },
      },
    },
  },
  {
    name: "mcp_trigger_refund",
    description: "Initiates a refund request for an order.",
    parameters: {
      type: "OBJECT",
      properties: {
        orderId: { type: "STRING", description: "Order ID." },
        reason: { type: "STRING", description: "Reason for refund." },
      },
      required: ["orderId", "reason"],
    },
  },
  {
    name: "mcp_lookup_product_schema",
    description: "Fetches live Product/ProductGroup Schema.org JSON-LD from Blogger post feeds.",
    parameters: {
      type: "OBJECT",
      properties: {
        blogId: { type: "STRING", description: "Blogger blog ID." },
        postId: { type: "STRING", description: "Blogger post ID." },
      },
      required: ["blogId", "postId"],
    },
  },
];

export async function executeMcpTool(req: McpToolRequest): Promise<McpToolResult> {
  const { name, arguments: args } = req;

  try {
    switch (name) {
      case "mcp_get_order_details": {
        return {
          tool: name,
          status: "success",
          data: {
            orderId: args.orderId ?? "ORD-10988",
            status: "SHIPPED",
            trackingNumber: "FEDEX-99182",
            estimatedDelivery: "2026-08-12",
          },
        };
      }

      case "mcp_trigger_refund": {
        return {
          tool: name,
          status: "success",
          data: {
            refundId: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
            status: "PROCESSING",
          },
        };
      }

      case "mcp_lookup_product_schema": {
        const { blogId, postId } = args;
        const bloggerService = new BloggerDataService();
        const rawSchema = await bloggerService.fetchPostSchema({ blogId, postId });

        if (!rawSchema) {
          return { tool: name, status: "error", error: `Could not fetch schema for ${blogId}/${postId}` };
        }

        const resolved = await bloggerService.resolveAndLoadSchema(rawSchema, { base: `${blogId}/${postId}` });
        const graphDoc = bloggerService.toGraphDocument(resolved);

        return {
          tool: name,
          status: "success",
          data: {
            isProduct: SchemaValidator.isProduct(rawSchema),
            offer: SchemaValidator.extractOfferDetails(rawSchema),
            graphDocument: graphDoc,
          },
        };
      }

      default:
        return { tool: name, status: "error", error: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { tool: name, status: "error", error: String(err) };
  }
}
