/**
 * Model Context Protocol (MCP) tool schemas and handlers for Ecommerce Support.
 */

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
    type: "function" as const,
    name: "mcp_get_order_details",
    description: "Fetches order status, items, tracking info, and payment breakdown by orderId or customer phone.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "The order ID, e.g. ORD-10928." },
        phone: { type: "string", description: "Customer phone number in E.164 format." },
      },
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "mcp_check_payment_status",
    description: "Checks payment gateway status, transaction ID, and refund eligibility for a given order.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order ID to check payment status for." },
      },
      required: ["orderId"],
    },
  },
  {
    type: "function" as const,
    name: "mcp_trigger_refund",
    description: "Initiates a refund request for an order or item.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Order ID to refund." },
        reason: { type: "string", description: "Reason for the refund." },
        amount: { type: "number", description: "Optional partial or full amount." },
      },
      required: ["orderId", "reason"],
    },
  },
  {
    type: "function" as const,
    name: "mcp_send_customer_notification",
    description: "Sends an SMS / WhatsApp notification update to the customer.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Target phone number." },
        message: { type: "string", description: "Message content to send." },
      },
      required: ["phone", "message"],
    },
  },
  {
    type: "function" as const,
    name: "mcp_lookup_product_schema",
    description: "Fetches live Product, ProductGroup, or Business Schema.org JSON-LD from Blogger post feeds.",
    parameters: {
      type: "object",
      properties: {
        blogId: { type: "string", description: "Blogger blog ID." },
        postId: { type: "string", description: "Blogger post ID containing the Product schema." },
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
        const orderId = args.orderId ?? "ORD-88219";
        return {
          tool: name,
          status: "success",
          data: {
            orderId,
            status: "SHIPPED",
            trackingNumber: "TRK-9002188",
            carrier: "FedEx",
            estimatedDelivery: "2026-08-10",
            items: [
              { name: "Wireless Earbuds Pro", price: 79.99, quantity: 1 }
            ],
            paymentStatus: "PAID",
          },
        };
      }

      case "mcp_check_payment_status": {
        return {
          tool: name,
          status: "success",
          data: {
            orderId: args.orderId,
            paid: true,
            method: "Credit Card (Visa **4242)",
            refundable: true,
          },
        };
      }

      case "mcp_trigger_refund": {
        return {
          tool: name,
          status: "success",
          data: {
            refundId: `REF-${Math.floor(100000 + Math.random() * 900000)}`,
            orderId: args.orderId,
            status: "PROCESSING",
            estimatedCompletion: "3-5 business days",
          },
        };
      }

      case "mcp_send_customer_notification": {
        return {
          tool: name,
          status: "success",
          data: {
            sent: true,
            phone: args.phone,
            channel: "SMS",
          },
        };
      }

      case "mcp_lookup_product_schema": {
        const { blogId, postId } = args;
        const bloggerService = new BloggerDataService();
        const rawSchema = await bloggerService.fetchPostSchema({ blogId, postId });

        if (!rawSchema) {
          return { tool: name, status: "error", error: `Could not fetch schema from blog ${blogId} post ${postId}` };
        }

        const resolved = await bloggerService.resolveAndLoadSchema(rawSchema, { base: `${blogId}/${postId}` });
        const graphDoc = bloggerService.toGraphDocument(resolved);

        const isProduct = SchemaValidator.isProduct(rawSchema);
        const offerInfo = SchemaValidator.extractOfferDetails(rawSchema);

        return {
          tool: name,
          status: "success",
          data: {
            isProduct,
            offerInfo,
            graphDocument: graphDoc,
          },
        };
      }

      default:
        return { tool: name, status: "error", error: `Unknown MCP tool ${name}` };
    }
  } catch (err) {
    return { tool: name, status: "error", error: String(err) };
  }
}
