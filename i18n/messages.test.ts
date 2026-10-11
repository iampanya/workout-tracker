import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
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

describe("common messages render", () => {
  const tEn = createTranslator({ locale: "en", messages: en, namespace: "common" });
  const tTh = createTranslator({ locale: "th", messages: th as typeof en, namespace: "common" });

  it("renders set counts like the old formatSetCount", () => {
    expect(tEn("setCount", { working: 3, warmups: 0 })).toBe("3 sets");
    expect(tEn("setCount", { working: 1, warmups: 0 })).toBe("1 set");
    expect(tEn("setCount", { working: 2, warmups: 2 })).toBe("2 sets + 2W");
    expect(tEn("setCount", { working: 0, warmups: 3 })).toBe("0 sets + 3W");
    expect(tTh("setCount", { working: 2, warmups: 2 })).toBe("2 เซ็ต + 2W");
  });

  it("renders durations like the old formatDuration", () => {
    expect(tEn("duration", { hours: 0, minutes: 45, mm: "45" })).toBe("45 min");
    expect(tEn("duration", { hours: 1, minutes: 15, mm: "15" })).toBe("1h 15m");
    expect(tEn("duration", { hours: 2, minutes: 0, mm: "00" })).toBe("2h 00m");
    expect(tTh("duration", { hours: 1, minutes: 5, mm: "05" })).toBe("1 ชม. 05 นาที");
    expect(tTh("duration", { hours: 0, minutes: 45, mm: "45" })).toBe("45 นาที");
  });

  it("pluralizes counts", () => {
    expect(tEn("exercises", { count: 1 })).toBe("1 exercise");
    expect(tEn("sets", { count: 4 })).toBe("4 sets");
    expect(tTh("exercises", { count: 5 })).toBe("5 ท่า");
  });
});
