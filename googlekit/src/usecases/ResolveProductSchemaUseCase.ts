/**
 * Use Case: Resolve Product Schema from Blogger JSON-LD feeds for GoogleKit.
 */

import { ISchemaService } from "../domain/ports";
import { SchemaValidator } from "../schema/validator";

export interface ResolveProductSchemaInput {
  blogId: string;
  postId: string;
}

export interface ResolveProductSchemaOutput {
  success: boolean;
  isProduct?: boolean;
  offerInfo?: { price?: number; currency?: string; available?: boolean };
  graphDocument?: Record<string, any>;
  error?: string;
}

export class ResolveProductSchemaUseCase {
  constructor(private readonly schemaService: ISchemaService) {}

  async execute(input: ResolveProductSchemaInput): Promise<ResolveProductSchemaOutput> {
    const { blogId, postId } = input;
    const rawSchema = await this.schemaService.fetchPostSchema({ blogId, postId });

    if (!rawSchema) {
      return { success: false, error: `Could not fetch schema from blog ${blogId} post ${postId}` };
    }

    const resolved = await this.schemaService.resolveAndLoadSchema(rawSchema, { base: `${blogId}/${postId}` });
    const graphDocument = this.schemaService.toGraphDocument(resolved);

    const isProduct = SchemaValidator.isProduct(rawSchema);
    const offerInfo = SchemaValidator.extractOfferDetails(rawSchema);

    return {
      success: true,
      isProduct,
      offerInfo,
      graphDocument,
    };
  }
}
