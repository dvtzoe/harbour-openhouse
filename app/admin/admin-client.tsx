"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminData } from "@/lib/admin";
import { fmtDuration } from "@/lib/format";
import { AsyncButton, Box, TopBar } from "../components/dos";
import { api } from "../components/hooks";

export default function AdminClient() {
  const [data, setData] = useState<AdminData | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>("/api/admin", { cache: "no-store" }));
    } catch (e) {
      if ((e as Error).message.includes("Staff login")) location.href = "/login?next=/admin";
      else setMsg({ text: (e as Error).message, bad: true });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(async (body: Record<string, unknown>, ok = "Saved.") => {
    try {
      setData(await api<AdminData>("/api/admin", { method: "POST", json: body }));
      setMsg({ text: ok });
      return true;
    } catch (e) {
      setMsg({ text: (e as Error).message, bad: true });
      return false;
    }
  }, []);

  const upload = useCallback(async (form: FormData) => {
    setMsg({ text: "Uploading..." });
    try {
      setData(await api<AdminData>("/api/admin/upload", { method: "POST", body: form }));
      setMsg({ text: "Uploaded." });
      return true;
    } catch (e) {
      setMsg({ text: (e as Error).message, bad: true });
      return false;
    }
  }, []);

  return (
    <div className="min-h-dvh">
      <TopBar
        right={
          <span className="flex gap-4">
            <a href="/station" className="underline">STATION</a>
            <a href="/leaderboard" className="underline">LEADERBOARD</a>
            <AsyncButton
              className="underline"
              pendingText={<span className="blink">LOGGING OUT_</span>}
              onClick={async () => {
                await api("/api/auth", { method: "DELETE" });
                location.href = "/login?next=/admin";
                await new Promise(() => {}); // stay pending while the login page loads
              }}
            >
              LOGOUT
            </AsyncButton>
          </span>
        }
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
        <h1 className="text-3xl font-bold text-dos-yellow">ADMIN.EXE</h1>
        {msg && (
          <p className={`sticky top-2 z-10 self-start px-3 py-1 font-bold ${msg.bad ? "bg-dos-red" : "bg-dos-green"} text-dos-black`}>
            {msg.text}
          </p>
        )}
        {!data ? (
          <p className="blink">LOADING...</p>
        ) : (
          <>
            <Act1Admin data={data} act={act} upload={upload} />
            <BrandsAdmin data={data} act={act} />
            <MajorsAdmin data={data} act={act} />
            <SeniorsAdmin data={data} act={act} />
            <AdsAdmin data={data} act={act} upload={upload} />
            <GuestsAdmin data={data} act={act} />
          </>
        )}
      </main>
    </div>
  );
}

type Act = (body: Record<string, unknown>, ok?: string) => Promise<boolean>;
type Upload = (form: FormData) => Promise<boolean>;

function Act1Admin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  return (
    <Box title="[1] DECODE IMAGES">
      <p className="mb-3 text-dos-gray">Shown in this order. Answers are letters A–Z only (case-insensitive).</p>
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
            <AsyncButton pendingText="DEL..." onClick={() => confirm("Delete this image?") && act({ action: "act1.delete", id: it.id }, "Deleted.")}>
              DEL
            </AsyncButton>
          </li>
        ))}
        {data.act1.length === 0 && <li className="text-dos-gray">No images yet.</li>}
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
          placeholder="ANSWER"
          value={answer}
          onChange={(e) => setAnswer(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
        />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!file || !answer || busy}>
          {busy ? <span className="blink">UPLOADING_</span> : "+ ADD IMAGE"}
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

  return (
    <Box title="[3] BRAND COLOURS">
      <p className="mb-3 text-dos-gray">
        Each attempt uses 3 random enabled brands ({enabled} enabled; need at least 3). Verify hex codes against the official brand guidelines.
      </p>
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
          const ok = await act({ action: "brand.add", name, hex }, "Brand added.");
          setBusy(false);
          if (ok) {
            setName("");
            setHex("#");
          }
        }}
      >
        <input className="dos-input" placeholder="Brand name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="dos-input w-32 uppercase" value={hex} onChange={(e) => setHex(e.target.value)} maxLength={7} />
        <span className="true-color inline-block h-8 w-8 border-2 border-dos-white" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "transparent" }} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || !/^#[0-9a-f]{6}$/i.test(hex) || busy}>
          {busy ? <span className="blink">ADDING_</span> : "+ ADD BRAND"}
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
        enabled
      </label>
      {dirty && (
        <button className={`dos-btn${saving ? " is-pending" : ""}`} disabled={saving} onClick={save}>
          {saving ? <span className="blink">SAVING_</span> : "[ENTER] SAVE"}
        </button>
      )}
      <AsyncButton pendingText="DEL..." onClick={() => confirm(`Delete ${b.name}?`) && act({ action: "brand.delete", id: b.id }, "Deleted.")}>
        DEL
      </AsyncButton>
    </li>
  );
}

function MajorsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Box title="MAJORS">
      <p className="mb-3 text-dos-gray">
        Players pick one when they register. In task 4 every major is an answer choice, in this order (the station uses keys 1–9, so keep it to 9 or fewer).
      </p>
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
              pendingText="DEL..."
              disabled={data.majors.length <= 2}
              onClick={() => confirm(`Delete ${m.name} and its seniors?`) && act({ action: "major.delete", id: m.id }, "Deleted.")}
            >
              DEL
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
          const ok = await act({ action: "major.add", name }, "Major added.");
          setBusy(false);
          if (ok) setName("");
        }}
      >
        <input className="dos-input" placeholder="Major name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || busy || data.majors.length >= 9}>
          {busy ? <span className="blink">ADDING_</span> : "+ ADD MAJOR"}
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

  return (
    <Box title="[4] SENIORS (ASK AROUND)">
      <p className="mb-3 text-dos-gray">
        Task 4 asks “What major is &lt;senior&gt; from?” about a random senior from the major the player picked (any senior if that major has none).
        A wrong answer gives a new senior.
      </p>
      <p className="mb-3 text-dos-gray">
        Per major: {data.majors.map((m) => `${m.name} ${count(m.id)}`).join(" · ")}
      </p>
      <ul className="flex flex-col gap-2">
        {data.seniors.map((s) => (
          <SeniorRow key={s.id + s.name + s.major_id} s={s} majors={data.majors} act={act} />
        ))}
        {data.seniors.length === 0 && <li className="text-dos-yellow">No seniors yet — task 4 can&apos;t be solved until you add one.</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          const ok = await act({ action: "senior.add", name, majorId }, "Senior added.");
          setBusy(false);
          if (ok) setName("");
        }}
      >
        <input className="dos-input" placeholder="Senior name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <MajorSelect majors={data.majors} value={majorId} onChange={setMajorId} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!name.trim() || !majorId || busy}>
          {busy ? <span className="blink">ADDING_</span> : "+ ADD SENIOR"}
        </button>
      </form>
    </Box>
  );
}

function MajorSelect({ majors, value, onChange }: { majors: AdminData["majors"]; value: string; onChange: (id: string) => void }) {
  return (
    <select className="dos-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        -- major --
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
          {saving ? <span className="blink">SAVING_</span> : "[ENTER] SAVE"}
        </button>
      )}
      <AsyncButton pendingText="DEL..." onClick={() => confirm(`Delete ${s.name}?`) && act({ action: "senior.delete", id: s.id }, "Deleted.")}>
        DEL
      </AsyncButton>
    </li>
  );
}

function AdsAdmin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <Box title="UNIVERSITY ADS (WRONG-ANSWER PENALTY)">
      <p className="mb-3 text-dos-gray">
        MP4/WebM, max ~95 MB each. A random one plays after every wrong answer. With none uploaded, a 10-second “stand by” screen is shown.
      </p>
      <ul className="flex flex-col gap-3">
        {data.ads.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3">
            <video src={a.url} className="h-24 border border-dos-gray bg-black" controls preload="metadata" />
            <span className="flex-1">{a.title}</span>
            <AsyncButton pendingText="DEL..." onClick={() => confirm(`Delete ad "${a.title}"?`) && act({ action: "ad.delete", id: a.id }, "Deleted.")}>
              DEL
            </AsyncButton>
          </li>
        ))}
        {data.ads.length === 0 && <li className="text-dos-gray">No ads yet.</li>}
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
        <input className="dos-input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className={`dos-btn${busy ? " is-pending" : ""}`} disabled={!file || busy}>
          {busy ? <span className="blink">UPLOADING_</span> : "+ UPLOAD AD"}
        </button>
      </form>
    </Box>
  );
}

function GuestsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [filter, setFilter] = useState("");
  const rows = data.guests.filter((g) => g.name.toLowerCase().includes(filter.toLowerCase()) || g.code.includes(filter.toUpperCase()));
  return (
    <Box title={`PLAYERS (${data.guests.length})`}>
      <div className="mb-3 flex flex-wrap gap-3">
        <input className="dos-input" placeholder="Search name/code" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <AsyncButton
          className="dos-btn ml-auto"
          pendingText={<span className="blink">RESETTING_</span>}
          onClick={() => {
            const c = prompt("This deletes ALL players and results. Type RESET to confirm.");
            return c ? act({ action: "reset.all", confirm: c }, "All players cleared.") : undefined;
          }}
        >
          RESET ALL
        </AsyncButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-dos-yellow">
            <tr>
              <th className="pr-4">NAME</th>
              <th className="pr-4">CODE</th>
              <th className="pr-4">MAJOR</th>
              <th className="pr-4">DONE</th>
              <th className="pr-4">TOTAL</th>
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
                  <AsyncButton pendingText={g.hidden ? "UNHIDE..." : "HIDE..."} onClick={() => act({ action: "guest.hide", id: g.id, hidden: !g.hidden })}>
                    {g.hidden ? "UNHIDE" : "HIDE"}
                  </AsyncButton>
                  <AsyncButton pendingText="DEL..." onClick={() => confirm(`Delete ${g.name}?`) && act({ action: "guest.delete", id: g.id }, "Deleted.")}>
                    DEL
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
