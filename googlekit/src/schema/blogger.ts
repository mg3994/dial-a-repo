/**
 * Interface representing resolved target location from an @id reference.
 */
export interface ResolvedId {
  blogId?: string;
  postId?: string;
  url?: string;
}

/**
 * Utility class for handling @id path resolution and deep merging object schemas.
 */
export class SchemaOverride {
  static resolveId(base: string, idValue: string): ResolvedId {
    if (!idValue) return {};

    if (idValue.startsWith('http://') || idValue.startsWith('https://')) {
      return { url: idValue };
    }

    const parts = idValue.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { blogId: parts[0], postId: parts[1] };
    }

    if (base && base.includes('/')) {
      const baseParts = base.split('/');
      if (baseParts.length >= 1 && baseParts[0]) {
        return { blogId: baseParts[0], postId: idValue };
      }
    }

    return { url: idValue };
  }

  static deepMerge(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    const output: Record<string, any> = { ...target };

    if (!source || typeof source !== 'object') return output;

    for (const key of Object.keys(source)) {
      const targetVal = target[key];
      const sourceVal = source[key];

      if (
        sourceVal &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        output[key] = SchemaOverride.deepMerge(targetVal, sourceVal);
      } else {
        output[key] = sourceVal;
      }
    }

    return output;
  }
}

export class BloggerDataService {
  static decodeEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#91;/g, '[')
      .replace(/&#93;/g, ']');
  }

  extractJsonLd(content: string): Record<string, any> | null {
    if (!content) return null;

    try {
      const scriptRegex =
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;
      const match = content.match(scriptRegex);
      let jsonContent = match ? match[1] : content;

      jsonContent = BloggerDataService.decodeEntities(jsonContent).trim();
      const cleaned = jsonContent.replace(/\/\*[\s\S]*?\*\//g, '').trim();

      return JSON.parse(cleaned) as Record<string, any>;
    } catch {
      try {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const candidate = BloggerDataService.decodeEntities(
            content.substring(start, end + 1)
          );
          return JSON.parse(candidate) as Record<string, any>;
        }
      } catch {
        // ignore
      }
      return null;
    }
  }

  async fetchPostSchema({
    blogId,
    postId,
  }: {
    blogId: string;
    postId: string;
  }): Promise<Record<string, any> | null> {
    const url = `https://www.blogger.com/feeds/${blogId}/posts/default/${postId}?alt=json`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as Record<string, any>;
      const entry = data?.entry;
      if (!entry) return null;

      const content = entry.content?.$t ?? '';
      return this.extractJsonLd(content);
    } catch {
      return null;
    }
  }

  async resolveAndLoadSchema(
    schema: Record<string, any>,
    { base }: { base: string }
  ): Promise<Record<string, any>> {
    const resolved = JSON.parse(JSON.stringify(schema));
    await this._traverseAndResolve(resolved, base);
    return resolved;
  }

  private async _traverseAndResolve(node: any, base: string): Promise<void> {
    if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      const idValue = node['@id'] ?? node['id'];

      if (typeof idValue === 'string' && idValue.trim().length > 0) {
        const resolvedId: ResolvedId = SchemaOverride.resolveId(base, idValue);
        const { blogId, postId, url: fullUrl } = resolvedId;

        let fetchedSchema: Record<string, any> | null = null;

        if (blogId && postId) {
          fetchedSchema = await this.fetchPostSchema({ blogId, postId });
        } else if (fullUrl) {
          try {
            const res = await fetch(fullUrl);
            if (res.ok) {
              const bodyText = await res.text();
              fetchedSchema = this.extractJsonLd(bodyText);
            }
          } catch {
            // ignore
          }
        }

        if (fetchedSchema) {
          const nestedBase = blogId && postId ? `${blogId}/${postId}` : base;

          fetchedSchema = await this.resolveAndLoadSchema(fetchedSchema, {
            base: nestedBase,
          });

          const merged = SchemaOverride.deepMerge(fetchedSchema, { ...node });

          for (const key of Object.keys(node)) {
            delete node[key];
          }
          Object.assign(node, merged);
          return;
        }
      }

      for (const key of Object.keys(node)) {
        const val = node[key];
        if (typeof val === 'object' && val !== null) {
          await this._traverseAndResolve(val, base);
        }
      }
    } else if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (typeof item === 'object' && item !== null) {
          await this._traverseAndResolve(item, base);
        }
      }
    }
  }

  toGraphDocument(
    schemas: Record<string, any> | Record<string, any>[]
  ): Record<string, any> {
    const inputList = Array.isArray(schemas) ? schemas : [schemas];

    const contextUrls = new Set<string>();
    const combinedContextMap: Record<string, any> = {};

    const entityMap = new Map<string, Record<string, any>>();
    const standaloneNodes: Record<string, any>[] = [];

    const extractAndStripContext = (node: any): any => {
      if (!node || typeof node !== 'object') return node;

      if (Array.isArray(node)) {
        return node.map((item) => extractAndStripContext(item));
      }

      if ('@context' in node && node['@context']) {
        this._mergeContextValue(node['@context'], contextUrls, combinedContextMap);
      }

      const cleaned: Record<string, any> = {};

      for (const [key, value] of Object.entries(node)) {
        if (key === '@context') continue;
        cleaned[key] = extractAndStripContext(value);
      }

      return cleaned;
    };

    for (const schema of inputList) {
      const cleanedSchema = extractAndStripContext(schema);

      if (Array.isArray(cleanedSchema['@graph'])) {
        for (const item of cleanedSchema['@graph']) {
          this._registerEntity(item, entityMap, standaloneNodes);
        }
      } else {
        this._registerEntity(cleanedSchema, entityMap, standaloneNodes);
      }
    }

    const finalContext = this._buildUnifiedContext(contextUrls, combinedContextMap);

    return {
      '@context': finalContext,
      '@graph': [...Array.from(entityMap.values()), ...standaloneNodes],
    };
  }

  private _mergeContextValue(
    contextVal: any,
    contextUrls: Set<string>,
    combinedMap: Record<string, any>
  ): void {
    if (!contextVal) return;

    if (typeof contextVal === 'string') {
      contextUrls.add(contextVal);
    } else if (Array.isArray(contextVal)) {
      for (const item of contextVal) {
        this._mergeContextValue(item, contextUrls, combinedMap);
      }
    } else if (typeof contextVal === 'object' && contextVal !== null) {
      for (const [k, v] of Object.entries(contextVal)) {
        if (v === null || v === undefined) continue;

        if (typeof v === 'object' && !Array.isArray(v)) {
          const existing = combinedMap[k];
          if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
            combinedMap[k] = SchemaOverride.deepMerge(existing, v);
          } else {
            combinedMap[k] = SchemaOverride.deepMerge({}, v);
          }
        } else {
          combinedMap[k] = v;
        }
      }
    }
  }

  private _buildUnifiedContext(
    contextUrls: Set<string>,
    combinedMap: Record<string, any>
  ): any {
    const hasMap = Object.keys(combinedMap).length > 0;
    const urls = Array.from(contextUrls);

    if (urls.length === 0 && !hasMap) {
      return 'https://schema.org';
    }

    if (urls.length === 0 && hasMap) {
      return combinedMap;
    }

    if (urls.length === 1 && !hasMap) {
      return urls[0];
    }

    const result: any[] = [...urls];
    if (hasMap) {
      result.push(combinedMap);
    }

    return result;
  }

  private _registerEntity(
    node: Record<string, any>,
    entityMap: Map<string, Record<string, any>>,
    standaloneNodes: Record<string, any>[]
  ): void {
    const id = node['@id'] ?? node['id'];

    if (id && typeof id === 'string') {
      if (entityMap.has(id)) {
        const existing = entityMap.get(id)!;
        entityMap.set(id, SchemaOverride.deepMerge(existing, node));
      } else {
        entityMap.set(id, node);
      }
    } else {
      standaloneNodes.push(node);
    }
  }
}
