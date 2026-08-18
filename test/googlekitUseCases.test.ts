import { describe, expect, it } from "vitest";
import { BloggerDataService } from "../googlekit/src/schema/blogger";
import { ResolveProductSchemaUseCase } from "../googlekit/src/usecases/ResolveProductSchemaUseCase";

describe("GoogleKit UseCases Suite", () => {
  it("executes ResolveProductSchemaUseCase cleanly", async () => {
    const bloggerService = new BloggerDataService();
    const useCase = new ResolveProductSchemaUseCase(bloggerService);

    const result = await useCase.execute({ blogId: "nonexistent_blog", postId: "nonexistent_post" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not fetch schema");
  });
});
