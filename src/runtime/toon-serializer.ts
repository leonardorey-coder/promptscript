import { encode, decode } from "@toon-format/toon";

export type ContextFormat = "json" | "toon";

export interface SerializationOptions {
  format?: ContextFormat;
  pretty?: boolean;
}

export class ToonSerializer {
  static serialize(obj: any, options: SerializationOptions = {}): string {
    const format = options.format || "json";

    switch (format) {
      case "toon":
        return encode(obj);
      
      case "json":
      default:
        return options.pretty
          ? JSON.stringify(obj, null, 2)
          : JSON.stringify(obj);
    }
  }

  static deserialize(text: string, format: ContextFormat = "json"): any {
    switch (format) {
      case "toon":
        return decode(text);
      
      case "json":
      default:
        return JSON.parse(text);
    }
  }

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static compareFormats(obj: any): {
    json: { size: number; tokens: number };
    toon: { size: number; tokens: number };
    savings: { bytes: number; tokens: number; percentage: number };
  } {
    const jsonStr = JSON.stringify(obj);
    const toonStr = encode(obj);

    const jsonSize = jsonStr.length;
    const toonSize = toonStr.length;

    const jsonTokens = this.estimateTokens(jsonStr);
    const toonTokens = this.estimateTokens(toonStr);

    const bytesSaved = jsonSize - toonSize;
    const tokensSaved = jsonTokens - toonTokens;
    const percentage = Math.round((tokensSaved / jsonTokens) * 100);

    return {
      json: { size: jsonSize, tokens: jsonTokens },
      toon: { size: toonSize, tokens: toonTokens },
      savings: {
        bytes: bytesSaved,
        tokens: tokensSaved,
        percentage,
      },
    };
  }
}

export function serializeContext(
  context: any,
  format: ContextFormat = "json",
): string {
  return ToonSerializer.serialize(context, { format });
}

export function deserializeContext(
  text: string,
  format: ContextFormat = "json",
): any {
  return ToonSerializer.deserialize(text, format);
}
