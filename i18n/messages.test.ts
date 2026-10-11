import { describe, it, expect } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { DEFAULT_LOCALE, isLocale } from "./config";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

// ICU argument names and rich-text tags used by a message (parse throws on invalid ICU).
function signature(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
        continue;
      }
      found.add(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const option of Object.values(el.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

const flatEn = flatten(en as Tree);
const flatTh = flatten(th as Tree);

describe("messages", () => {
  it("th and en have exactly the same keys", () => {
    expect(Object.keys(flatTh).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("every message is non-empty", () => {
    for (const [key, message] of [...Object.entries(flatEn), ...Object.entries(flatTh)]) {
      expect({ key, empty: message.trim() === "" }).toEqual({ key, empty: false });
    }
  });

  it("th uses the same ICU arguments and tags as en, and both parse", () => {
    for (const [key, message] of Object.entries(flatEn)) {
      expect({ key, signature: signature(flatTh[key] ?? "") }).toEqual({
        key,
        signature: signature(message),
      });
    }
  });
});

describe("isLocale", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("th")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("defaults to Thai", () => {
    expect(DEFAULT_LOCALE).toBe("th");
  });
});
