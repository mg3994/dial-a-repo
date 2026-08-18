export interface SchemaNode {
  "@type"?: string | string[];
  "@id"?: string;
  [key: string]: any;
}

export class SchemaValidator {
  static isProduct(node: SchemaNode): boolean {
    if (!node || typeof node !== "object") return false;
    const type = node["@type"];
    if (typeof type === "string") {
      return type === "Product" || type === "ProductGroup" || type.endsWith("/Product") || type.endsWith("/ProductGroup");
    }
    if (Array.isArray(type)) {
      return type.some((t) => t === "Product" || t === "ProductGroup");
    }
    return false;
  }

  static isOrganization(node: SchemaNode): boolean {
    if (!node || typeof node !== "object") return false;
    const type = node["@type"];
    if (typeof type === "string") {
      return type === "Organization" || type === "LocalBusiness" || type === "Store" || type.includes("Business");
    }
    if (Array.isArray(type)) {
      return type.some((t) => t === "Organization" || t === "LocalBusiness" || t === "Store");
    }
    return false;
  }

  static extractOfferDetails(node: SchemaNode): { price?: number; currency?: string; available?: boolean } {
    if (!node) return {};
    const offers = node.offers ?? node.offer;
    const offerObj = Array.isArray(offers) ? offers[0] : offers;

    if (!offerObj || typeof offerObj !== "object") return {};

    const price = typeof offerObj.price === "number" ? offerObj.price : parseFloat(offerObj.price ?? "0");
    const currency = offerObj.priceCurrency ?? "USD";
    const availability = String(offerObj.availability ?? "");
    const available = availability.includes("InStock") || availability.includes("InStoreOnly") || availability === "";

    return { price: isNaN(price) ? undefined : price, currency, available };
  }
}
