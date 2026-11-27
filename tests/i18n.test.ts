import { describe, expect, test } from "bun:test";
import { DEFAULTS, LOCALES, flatten, format, fromAcceptLanguage, mergeMessages, translate, unflatten } from "../lib/i18n/core";
import en from "../messages/en.json";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

describe("messages files", () => {
  for (const l of LOCALES) {
    test(`${l}.json has exactly the keys of en.json`, () => {
      expect(Object.keys(DEFAULTS[l]).sort()).toEqual(Object.keys(DEFAULTS.en).sort());
    });
    test(`${l}.json keeps every {placeholder} and <tag>`, () => {
      for (const [k, v] of Object.entries(DEFAULTS.en)) {
        expect({ k, p: placeholders(DEFAULTS[l][k] ?? "") }).toEqual({ k, p: placeholders(v) });
        expect({ k, t: tags(DEFAULTS[l][k] ?? "") }).toEqual({ k, t: tags(v) });
      }
    });
    test(`${l}.json has no empty texts`, () => {
      for (const [k, v] of Object.entries(DEFAULTS[l])) expect({ k, empty: !v.trim() }).toEqual({ k, empty: false });
    });
  }
});

describe("i18n core", () => {
  test("format fills placeholders and {event}", () => {
    expect(format("TASK {n}/4", { n: 2 })).toBe("TASK 2/4");
    expect(format("about {event}")).toBe("about Harbour.Space@UTCC");
    expect(format("{missing}")).toBe("{missing}");
  });

  test("overrides win, then the locale's file, then English", () => {
    const m = mergeMessages({ th: { "play.start": "เริ่ม" } });
    expect(translate(m, "th", "play.start")).toBe("เริ่ม");
    expect(translate(m, "en", "play.start")).toBe(DEFAULTS.en["play.start"]);
    m.th["login.title"] = "";
    expect(translate(m, "th", "login.title")).toBe(DEFAULTS.en["login.title"]);
  });

  test("unflatten undoes flatten", () => {
    expect(unflatten(flatten(en))).toEqual(en);
  });

  test("Accept-Language picks the best supported language", () => {
    expect(fromAcceptLanguage("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(fromAcceptLanguage("en-US,en;q=0.9,th;q=0.5")).toBe("en");
    expect(fromAcceptLanguage("fr-FR,th;q=0.4")).toBe("th");
    expect(fromAcceptLanguage("fr,de")).toBeNull();
    expect(fromAcceptLanguage(undefined)).toBeNull();
  });
});
