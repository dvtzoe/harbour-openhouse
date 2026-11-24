"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminData } from "@/lib/admin";
import { fmtDuration } from "@/lib/format";
import { Box, TopBar } from "../components/dos";
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
    } catch (e) {
      setMsg({ text: (e as Error).message, bad: true });
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
            <button
              className="underline"
              onClick={async () => {
                await api("/api/auth", { method: "DELETE" });
                location.href = "/login?next=/admin";
              }}
            >
              LOGOUT
            </button>
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
            <Act4Admin data={data} act={act} />
            <AdsAdmin data={data} act={act} upload={upload} />
            <GuestsAdmin data={data} act={act} />
          </>
        )}
      </main>
    </div>
  );
}

type Act = (body: Record<string, unknown>, ok?: string) => Promise<void>;
type Upload = (form: FormData) => Promise<boolean>;

function Act1Admin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);

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
              onBlur={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
                if (v !== it.answer) act({ action: "act1.update", id: it.id, answer: v });
              }}
            />
            <button className="dos-btn" disabled={i === 0} onClick={() => act({ action: "act1.move", id: it.id, dir: -1 })}>↑</button>
            <button className="dos-btn" disabled={i === data.act1.length - 1} onClick={() => act({ action: "act1.move", id: it.id, dir: 1 })}>↓</button>
            <button
              className="dos-btn"
              onClick={() => confirm("Delete this image?") && act({ action: "act1.delete", id: it.id }, "Deleted.")}
            >
              DEL
            </button>
          </li>
        ))}
        {data.act1.length === 0 && <li className="text-dos-gray">No images yet.</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const f = new FormData();
          f.set("kind", "act1");
          f.set("file", file);
          f.set("answer", answer);
          if (await upload(f)) {
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
        <button className="dos-btn" disabled={!file || !answer}>+ ADD IMAGE</button>
      </form>
    </Box>
  );
}

function BrandsAdmin({ data, act }: { data: AdminData; act: Act }) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#");
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
          await act({ action: "brand.add", name, hex }, "Brand added.");
          setName("");
          setHex("#");
        }}
      >
        <input className="dos-input" placeholder="Brand name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="dos-input w-32 uppercase" value={hex} onChange={(e) => setHex(e.target.value)} maxLength={7} />
        <span className="inline-block h-8 w-8 border-2 border-dos-white" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "transparent" }} />
        <button className="dos-btn" disabled={!name.trim() || !/^#[0-9a-f]{6}$/i.test(hex)}>+ ADD BRAND</button>
      </form>
    </Box>
  );
}

function BrandRow({ b, act }: { b: AdminData["brands"][number]; act: Act }) {
  const [name, setName] = useState(b.name);
  const [hex, setHex] = useState(b.hex);
  const dirty = name !== b.name || hex.toUpperCase() !== b.hex;
  return (
    <li className="flex flex-wrap items-center gap-3">
      <span className="inline-block h-8 w-8 border-2 border-dos-white" style={{ background: /^#[0-9a-f]{6}$/i.test(hex) ? hex : b.hex }} />
      <input className="dos-input w-44" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="dos-input w-28 uppercase" value={hex} onChange={(e) => setHex(e.target.value)} maxLength={7} />
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={!!b.enabled}
          onChange={(e) => act({ action: "brand.update", id: b.id, name: b.name, hex: b.hex, enabled: e.target.checked })}
        />
        enabled
      </label>
      {dirty && (
        <button className="dos-btn" onClick={() => act({ action: "brand.update", id: b.id, name, hex, enabled: !!b.enabled })}>
          SAVE
        </button>
      )}
      <button className="dos-btn" onClick={() => confirm(`Delete ${b.name}?`) && act({ action: "brand.delete", id: b.id }, "Deleted.")}>
        DEL
      </button>
    </li>
  );
}

function Act4Admin({ data, act }: { data: AdminData; act: Act }) {
  const [question, setQuestion] = useState(data.act4.question);
  const [options, setOptions] = useState<string[]>(data.act4.options);
  const [correct, setCorrect] = useState(data.act4.correct);

  return (
    <Box title="[4] ASK-A-STUDENT QUESTION">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "act4.set", question, options, correct });
        }}
      >
        <label>QUESTION</label>
        <textarea className="dos-input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        <label>OPTIONS (select the correct one)</label>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-3">
            <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} />
            <input className="dos-input flex-1" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            <button
              type="button"
              className="dos-btn"
              disabled={options.length <= 2}
              onClick={() => {
                setOptions(options.filter((_, j) => j !== i));
                setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
              }}
            >
              DEL
            </button>
          </div>
        ))}
        <div className="flex gap-3">
          <button type="button" className="dos-btn" disabled={options.length >= 9} onClick={() => setOptions([...options, ""])}>
            + OPTION
          </button>
          <button className="dos-btn">SAVE QUESTION</button>
        </div>
      </form>
    </Box>
  );
}

function AdsAdmin({ data, act, upload }: { data: AdminData; act: Act; upload: Upload }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
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
            <button className="dos-btn" onClick={() => confirm(`Delete ad "${a.title}"?`) && act({ action: "ad.delete", id: a.id }, "Deleted.")}>
              DEL
            </button>
          </li>
        ))}
        {data.ads.length === 0 && <li className="text-dos-gray">No ads yet.</li>}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          const f = new FormData();
          f.set("kind", "ad");
          f.set("file", file);
          f.set("title", title);
          if (await upload(f)) {
            setTitle("");
            setFile(null);
            setInputKey((k) => k + 1);
          }
        }}
      >
        <input key={inputKey} type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input className="dos-input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="dos-btn" disabled={!file}>+ UPLOAD AD</button>
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
        <button
          className="dos-btn ml-auto"
          onClick={() => {
            const c = prompt("This deletes ALL players and results. Type RESET to confirm.");
            if (c) act({ action: "reset.all", confirm: c }, "All players cleared.");
          }}
        >
          RESET ALL
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-dos-yellow">
            <tr>
              <th className="pr-4">NAME</th>
              <th className="pr-4">CODE</th>
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
                <td className="pr-4">{g.done}/4</td>
                <td className="pr-4">{g.total != null ? fmtDuration(g.total) : "-"}</td>
                <td className="flex gap-2 py-1">
                  <button className="dos-btn" onClick={() => act({ action: "guest.hide", id: g.id, hidden: !g.hidden })}>
                    {g.hidden ? "UNHIDE" : "HIDE"}
                  </button>
                  <button className="dos-btn" onClick={() => confirm(`Delete ${g.name}?`) && act({ action: "guest.delete", id: g.id }, "Deleted.")}>
                    DEL
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}
