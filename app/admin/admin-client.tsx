"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminData } from "@/lib/admin";
import { fmtDuration } from "@/lib/format";
import { DEFAULTS, KEYS, LOCALES, LOCALE_LABELS, unflatten, type Locale, type MessageKey } from "@/lib/i18n/core";
import { AsyncButton, Box, TopBar } from "../components/dos";
import { api, isStaffLoginError } from "../components/hooks";
import { useI18n } from "../components/i18n";

export default function AdminClient() {
  const [data, setData] = useState<AdminData | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const { t } = useI18n();

  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>("/api/admin", { cache: "no-store" }));
    } catch (e) {
      if (isStaffLoginError(e)) location.href = "/login?next=/admin";
      else setMsg({ text: (e as Error).message, bad: true });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>, ok: MessageKey = "admin.saved") => {
      try {
        setData(await api<AdminData>("/api/admin", { method: "POST", json: body }));
        setMsg({ text: t(ok) });
        return true;
      } catch (e) {
        setMsg({ text: (e as Error).message, bad: true });
        return false;
      }
    },
    [t],
  );

  const upload = useCallback(
    async (form: FormData) => {
      setMsg({ text: t("admin.uploading") });
      try {
        setData(await api<AdminData>("/api/admin/upload", { method: "POST", body: form }));
        setMsg({ text: t("admin.uploaded") });
        return true;
      } catch (e) {
        setMsg({ text: (e as Error).message, bad: true });
        return false;
      }
    },
    [t],
  );

  return (
    <div className="min-h-dvh">
      <TopBar
        right={
          <span className="flex gap-4">
            <a href="/station" className="underline">
              {t("admin.station")}
            </a>
            <a href="/leaderboard" className="underline">
              {t("admin.leaderboard")}
            </a>
            <AsyncButton
              className="underline"
              pendingText={<span className="blink">{t("admin.loggingOut")}</span>}
              onClick={async () => {
                await api("/api/auth", { method: "DELETE" });
                location.href = "/login?next=/admin";
                await new Promise(() => {}); // stay pending while the login page loads
              }}
            >
              {t("admin.logout")}
            </AsyncButton>
          </span>
        }
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
        <h1 className="text-3xl font-bold text-dos-yellow">{t("admin.title")}</h1>
        {msg && (
          <p className={`sticky top-2 z-10 self-start px-3 py-1 font-bold ${msg.bad ? "bg-dos-red" : "bg-dos-green"} text-dos-black`}>
            {msg.text}
          </p>
        )}
        {!data ? (
          <p className="blink">{t("common.loading")}</p>
        ) : (
          <>
            <Act1Admin data={data} act={act} upload={upload} />
            <BrandsAdmin data={data} act={act} />
            <MajorsAdmin data={data} act={act} />
            <SeniorsAdmin data={data} act={act} />
            <ShareAdmin data={data} act={act} />
            <AdsAdmin data={data} act={act} upload={upload} />
            <GuestsAdmin data={data} act={act} />
            <TranslationsAdmin data={data} act={act} />
          </>
        )}
      </main>
    </div>
  );
}

type Act = (body: Record<string, unknown>, ok?: MessageKey) => Promise<boolean>;
type Upload = (form: FormData) => Promise<boolean>;

function Act1Admin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  return (
    <Box title={t("admin.act1Title")}>
      <p className="mb-3 text-dos-gray">{t("admin.act1Help")}</p>
      <ul className="flex flex-col gap-3">
        {data.act1.map((it, i) => (
          <li key={it.id} className="flex flex-wrap items-center gap-3 border-b border-dos-dark pb-3">
            <span className="w-8 text-dos-yellow">{i + 1}.</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" className="h-20 w-20 border border-dos-gray bg-black object-contain" />
            <input
              className="dos-input w-48 uppercase"
              defaultValue={it.answer}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} // ENTER saves (via blur)
              onBlur={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                if (v !== it.answer) act({ action: "act1.update", id: it.id, answer: v });
              }}
            />
            <AsyncButton disabled={i === 0} onClick={() => act({ action: "act1.move", id: it.id, dir: -1 })}>↑</AsyncButton>
            <AsyncButton disabled={i === data.act1.length - 1} onClick={() => act({ action: "act1.move", id: it.id, dir: 1 })}>↓</AsyncButton>
            <AsyncButton
              pendingText={t("admin.delPending")}
              onClick={() => confirm(t("admin.act1ConfirmDelete")) && act({ action: "act1.delete", id: it.id }, "admin.deleted")}
            >
              {t("admin.del")}
            </AsyncButton>
          </li>
        ))}
        {data.act1.length === 0 && <li className="text-dos-gray">{t("admin.act1Empty")}</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file || busy) return;
          const f = new FormData();
          f.set("kind", "act1");
          f.set("file", file);
          f.set("answer", answer);
          setBusy(true);
          const ok = await upload(f);
          setBusy(false);
          if (ok) {
            setAnswer("");
            setFile(null);
            setInputKey((k) => k + 1);
          }
        }}
      >
        <input key={inputKey} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input
          className="dos-input uppercase"
          placeholder={t("admin.act1AnswerPlaceholder")}
          value={answer}
          onChange={(e) => setAnswer(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
        />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!file || !answer || busy}>
          {busy ? <span className="blink">{t("admin.uploadingBtn")}</span> : t("admin.act1Add")}
        </button>
      </form>
    </Box>
  );
}

function BrandsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#");
  const [busy, setBusy] = useState(false);
  const enabled = data.brands.filter((b) => b.enabled).length;
  const { t } = useI18n();

  return (
    <Box title={t("admin.brandsTitle")}>
      <p className="mb-3 text-dos-gray">{t("admin.brandsHelp", { n: enabled })}</p>
      <ul className="flex flex-col gap-2">
        {data.brands.map((b) => (
          <BrandRow key={b.id + b.hex + b.name + b.enabled} b={b} act={act} />
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const ok = await act({ action: "brand.add", name, hex }, "admin.brandAdded");
          setBusy(false);
          if (ok) {
            setName("");
            setHex("#");
          }
        }}
      >
        <input className="dos-input" placeholder={t("admin.brandPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="dos-input w-32 uppercase" value={hex} onChange={(e) => setHex(e.target.value)} maxLength={7} />
        <span className="true-color inline-block h-8 w-8 border-2 border-dos-white" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "transparent" }} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || !/^#[0-9a-f]{6}$/i.test(hex) || busy}>
          {busy ? <span className="blink">{t("admin.adding")}</span> : t("admin.brandAdd")}
        </button>
      </form>
    </Box>
  );
}

function BrandRow({ b, act }: { b: AdminData["brands"][number]; act: Act }) {
  const [name, setName] = useState(b.name);
  const [hex, setHex] = useState(b.hex);
  const [enabled, setEnabled] = useState(!!b.enabled); // flips instantly; the row remounts with the server's value
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const dirty = name !== b.name || hex.toUpperCase() !== b.hex;
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    await act({ action: "brand.update", id: b.id, name, hex, enabled: !!b.enabled });
    setSaving(false);
  };
  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && save();
  return (
    <li className="flex flex-wrap items-center gap-3">
      <span className="true-color inline-block h-8 w-8 border-2 border-dos-white" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : b.hex }} />
      <input className="dos-input w-44" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} />
      <input className="dos-input w-28 uppercase" value={hex} onChange={(e) => setHex(e.target.value)} onKeyDown={onEnter} maxLength={7} />
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={enabled}
          onChange={async (e) => {
            const next = e.target.checked;
            setEnabled(next);
            if (!(await act({ action: "brand.update", id: b.id, name: b.name, hex: b.hex, enabled: next }))) setEnabled(!next);
          }}
        />
        {t("admin.brandEnabled")}
      </label>
      {dirty && (
        <button className={`dos-btn${saving ? " is-pending" : ""}`} disabled={saving} onClick={save}>
          {saving ? <span className="blink">{t("admin.saving")}</span> : t("admin.save")}
        </button>
      )}
      <AsyncButton
        pendingText={t("admin.delPending")}
        onClick={() => confirm(t("admin.confirmDelete", { name: b.name })) && act({ action: "brand.delete", id: b.id }, "admin.deleted")}
      >
        {t("admin.del")}
      </AsyncButton>
    </li>
  );
}

function MajorsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  return (
    <Box title={t("admin.majorsTitle")}>
      <p className="mb-3 text-dos-gray">{t("admin.majorsHelp")}</p>
      <ul className="flex flex-col gap-2">
        {data.majors.map((m, i) => (
          <li key={m.id + m.name} className="flex flex-wrap items-center gap-3">
            <span className="w-8 text-dos-yellow">{i + 1}.</span>
            <input
              className="dos-input w-72"
              defaultValue={m.name}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} // ENTER saves (via blur)
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== m.name) act({ action: "major.update", id: m.id, name: v });
              }}
            />
            <AsyncButton disabled={i === 0} onClick={() => act({ action: "major.move", id: m.id, dir: -1 })}>↑</AsyncButton>
            <AsyncButton disabled={i === data.majors.length - 1} onClick={() => act({ action: "major.move", id: m.id, dir: 1 })}>↓</AsyncButton>
            <AsyncButton
              pendingText={t("admin.delPending")}
              disabled={data.majors.length <= 2}
              onClick={() => confirm(t("admin.majorConfirmDelete", { name: m.name })) && act({ action: "major.delete", id: m.id }, "admin.deleted")}
            >
              {t("admin.del")}
            </AsyncButton>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const ok = await act({ action: "major.add", name }, "admin.majorAdded");
          setBusy(false);
          if (ok) setName("");
        }}
      >
        <input className="dos-input" placeholder={t("admin.majorPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || busy || data.majors.length >= 9}>
          {busy ? <span className="blink">{t("admin.adding")}</span> : t("admin.majorAdd")}
        </button>
      </form>
    </Box>
  );
}

function SeniorsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [name, setName] = useState("");
  const [majorId, setMajorId] = useState("");
  const [busy, setBusy] = useState(false);
  const count = (id: string) => data.seniors.filter((s) => s.major_id === id).length;
  const { t } = useI18n();

  return (
    <Box title={t("admin.seniorsTitle")}>
      <p className="mb-3 text-dos-gray">{t("admin.seniorsHelp")}</p>
      <p className="mb-3 text-dos-gray">
        {t("admin.seniorsPerMajor", { list: data.majors.map((m) => `${m.name} ${count(m.id)}`).join(" · ") })}
      </p>
      <ul className="flex flex-col gap-2">
        {data.seniors.map((s) => (
          <SeniorRow key={s.id + s.name + s.major_id} s={s} majors={data.majors} act={act} />
        ))}
        {data.seniors.length === 0 && <li className="text-dos-yellow">{t("admin.seniorsEmpty")}</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const ok = await act({ action: "senior.add", name, majorId }, "admin.seniorAdded");
          setBusy(false);
          if (ok) setName("");
        }}
      >
        <input className="dos-input" placeholder={t("admin.seniorPlaceholder")} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <MajorSelect majors={data.majors} value={majorId} onChange={setMajorId} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || !majorId || busy}>
          {busy ? <span className="blink">{t("admin.adding")}</span> : t("admin.seniorAdd")}
        </button>
      </form>
    </Box>
  );
}

function MajorSelect({ majors, value, onChange }: { majors: AdminData["majors"]; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <select className="dos-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        {t("admin.seniorMajorPlaceholder")}
      </option>
      {majors.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function SeniorRow({ s, majors, act }: { s: AdminData["seniors"][number]; majors: AdminData["majors"]; act: Act }) {
  const [name, setName] = useState(s.name);
  const [majorId, setMajorId] = useState(s.major_id);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const dirty = name.trim() !== s.name || majorId !== s.major_id;
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    await act({ action: "senior.update", id: s.id, name, majorId });
    setSaving(false);
  };
  return (
    <li className="flex flex-wrap items-center gap-3">
      <input className="dos-input w-56" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} maxLength={40} />
      <MajorSelect majors={majors} value={majorId} onChange={setMajorId} />
      {dirty && (
        <button className={`dos-btn${saving ? " is-pending" : ""}`} disabled={saving} onClick={save}>
          {saving ? <span className="blink">{t("admin.saving")}</span> : t("admin.save")}
        </button>
      )}
      <AsyncButton
        pendingText={t("admin.delPending")}
        onClick={() => confirm(t("admin.confirmDelete", { name: s.name })) && act({ action: "senior.delete", id: s.id }, "admin.deleted")}
      >
        {t("admin.del")}
      </AsyncButton>
    </li>
  );
}

function ShareAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [tag, setTag] = useState(data.share.tag);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  return (
    <Box title={t("admin.shareTitle")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          await act({ action: "share.set", tag });
          setBusy(false);
        }}
      >
        <label>{t("admin.shareLabel")}</label>
        <input className="dos-input" maxLength={80} placeholder="#HarbourSpaceUTCC @handle" value={tag} onChange={(e) => setTag(e.target.value)} />
        <div>
          <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={busy}>
            {busy ? <span className="blink">{t("admin.saving")}</span> : t("admin.shareSave")}
          </button>
        </div>
      </form>
    </Box>
  );
}

function AdsAdmin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();
  return (
    <Box title={t("admin.adsTitle")}>
      <p className="mb-3 text-dos-gray">{t("admin.adsHelp")}</p>
      <ul className="flex flex-col gap-3">
        {data.ads.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3">
            <video src={a.url} className="h-24 border border-dos-gray bg-black" controls preload="metadata" />
            <span className="flex-1">{a.title}</span>
            <AsyncButton
              pendingText={t("admin.delPending")}
              onClick={() => confirm(t("admin.adConfirmDelete", { title: a.title })) && act({ action: "ad.delete", id: a.id }, "admin.deleted")}
            >
              {t("admin.del")}
            </AsyncButton>
          </li>
        ))}
        {data.ads.length === 0 && <li className="text-dos-gray">{t("admin.adsEmpty")}</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file || busy) return;
          const f = new FormData();
          f.set("kind", "ad");
          f.set("file", file);
          f.set("title", title);
          setBusy(true);
          const ok = await upload(f);
          setBusy(false);
          if (ok) {
            setTitle("");
            setFile(null);
            setInputKey((k) => k + 1);
          }
        }}
      >
        <input key={inputKey} type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input className="dos-input" placeholder={t("admin.adTitlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!file || busy}>
          {busy ? <span className="blink">{t("admin.uploadingBtn")}</span> : t("admin.adUpload")}
        </button>
      </form>
    </Box>
  );
}

function GuestsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [filter, setFilter] = useState("");
  const { t } = useI18n();
  const rows = data.guests.filter((g) => g.name.toLowerCase().includes(filter.toLowerCase()) || g.code.includes(filter.toUpperCase()));
  return (
    <Box title={t("admin.playersTitle", { n: data.guests.length })}>
      <div className="mb-3 flex flex-wrap gap-3">
        <input className="dos-input" placeholder={t("admin.playersSearch")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <AsyncButton
          className="dos-btn ml-auto"
          pendingText={<span className="blink">{t("admin.resetting")}</span>}
          onClick={() => {
            const c = prompt(t("admin.resetPrompt"));
            return c ? act({ action: "reset.all", confirm: c }, "admin.resetDone") : undefined;
          }}
        >
          {t("admin.resetAll")}
        </AsyncButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-dos-yellow">
            <tr>
              <th className="pr-4">{t("admin.colName")}</th>
              <th className="pr-4">{t("admin.colCode")}</th>
              <th className="pr-4">{t("admin.colMajor")}</th>
              <th className="pr-4">{t("admin.colDone")}</th>
              <th className="pr-4">{t("admin.colTotal")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className={g.hidden ? "text-dos-dark line-through" : ""}>
                <td className="pr-4">{g.name}</td>
                <td className="pr-4">{g.code}</td>
                <td className="pr-4">{g.major ?? "-"}</td>
                <td className="pr-4">{g.done}/4</td>
                <td className="pr-4">{g.total != null ? fmtDuration(g.total) : "-"}</td>
                <td className="flex gap-2 py-1">
                  <AsyncButton
                    pendingText={t(g.hidden ? "admin.unhidePending" : "admin.hidePending")}
                    onClick={() => act({ action: "guest.hide", id: g.id, hidden: !g.hidden })}
                  >
                    {t(g.hidden ? "admin.unhide" : "admin.hide")}
                  </AsyncButton>
                  <AsyncButton
                    pendingText={t("admin.delPending")}
                    onClick={() => confirm(t("admin.confirmDelete", { name: g.name })) && act({ action: "guest.delete", id: g.id }, "admin.deleted")}
                  >
                    {t("admin.del")}
                  </AsyncButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}

/** Edit any UI text per language. Saved as overrides in D1 on top of messages/<lang>.json. */
function TranslationsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const overrides = data.i18n;
  const isChanged = (k: MessageKey) => LOCALES.some((l) => overrides[l]?.[k] !== undefined);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return KEYS.filter(
      (k) =>
        (!changedOnly || LOCALES.some((l) => overrides[l]?.[k] !== undefined)) &&
        (!q || k.toLowerCase().includes(q) || LOCALES.some((l) => (overrides[l]?.[k] ?? DEFAULTS[l][k]).toLowerCase().includes(q))),
    );
  }, [filter, changedOnly, overrides]);
  const visible = showAll || filter.trim() !== "" || changedOnly;

  /** Downloads the merged texts as a messages file, so admin edits can be copied back into the repo. */
  const download = (l: Locale) => {
    const merged = { ...DEFAULTS[l], ...overrides[l] };
    const blob = new Blob([JSON.stringify(unflatten(merged), null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${l}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Box title={t("admin.i18nTitle")}>
      <p className="mb-3 text-dos-gray">{t("admin.i18nHelp")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className="dos-input" placeholder={t("admin.i18nSearch")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
          {t("admin.i18nChangedOnly")}
        </label>
        {!showAll && (
          <button className="dos-btn" onClick={() => setShowAll(true)}>
            {t("admin.i18nShowAll")}
          </button>
        )}
        <span className="text-dos-gray">{t("admin.i18nCount", { shown: visible ? rows.length : 0, total: KEYS.length })}</span>
        <span className="ml-auto flex gap-3">
          {LOCALES.map((l) => (
            <button key={l} className="dos-btn" onClick={() => download(l)}>
              {t("admin.i18nDownload", { file: `${l}.json` })}
            </button>
          ))}
        </span>
      </div>
      {!visible ? (
        <p className="text-dos-gray">{t("admin.i18nHint")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-dos-yellow">
              <tr>
                <th className="pr-4">{t("admin.i18nKey")}</th>
                {LOCALES.map((l) => (
                  <th key={l} className="pr-4">
                    {LOCALE_LABELS[l]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k} className="align-top">
                  <td className={`py-1 pr-4 text-sm ${isChanged(k) ? "text-dos-yellow" : "text-dos-gray"}`}>{k}</td>
                  {LOCALES.map((l) => {
                    const value = overrides[l]?.[k] ?? DEFAULTS[l][k];
                    const changed = overrides[l]?.[k] !== undefined;
                    return (
                      <td key={l} className="min-w-64 py-1 pr-4">
                        <textarea
                          key={value} // remounts with the saved text after each save
                          lang={l}
                          rows={Math.min(4, Math.ceil(value.length / 40) || 1)}
                          className={`dos-input w-full resize-y ${changed ? "outline outline-2 outline-dos-yellow" : ""}`}
                          defaultValue={value}
                          placeholder={DEFAULTS[l][k]}
                          title={k}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              e.currentTarget.blur(); // ENTER saves (via blur); SHIFT+ENTER is a new line
                            }
                          }}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== value) act({ action: "i18n.set", locale: l, key: k, value: v }, "admin.i18nSaved");
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
