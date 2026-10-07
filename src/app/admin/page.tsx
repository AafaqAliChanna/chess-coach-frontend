"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";

const RESOURCE_TYPES = ["COURSE", "VIDEO", "ARTICLE", "PRACTICE"] as const;
const TOPICS = ["opening", "tactics", "calculation", "king-safety", "endgame", "positional"] as const;

type Resource = {
  id: number;
  title: string;
  url: string;
  type: (typeof RESOURCE_TYPES)[number];
  description: string;
  topicKey: (typeof TOPICS)[number];
  createdAt: string;
  showOnDashboard?: boolean;
  showInResources?: boolean;
};

type LearningPack = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  youtubeUrl: string | null;
  openingMatchTag: string | null;
};

type PackDetail = LearningPack & {
  tracking?: boolean;
  videoWatched?: boolean;
  games: { id: number; title: string; description: string | null }[];
  relatedPuzzles?: unknown[];
};

type ResourceForm = {
  title: string;
  url: string;
  type: (typeof RESOURCE_TYPES)[number];
  topicKey: (typeof TOPICS)[number];
  description: string;
  showOnDashboard: boolean;
  showInResources: boolean;
};

type PackForm = {
  title: string;
  imageUrl: string;
  description: string;
  youtubeUrl: string;
  openingMatchTag: string;
};

type GameForm = { title: string; description: string; pgn: string };
type AccessState = "loading" | "denied" | "allowed";

const emptyGame: GameForm = { title: "", description: "", pgn: "" };

function authHeaders(json = false): HeadersInit {
  const auth = getAuth();
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}) };
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
  }
  return `${fallback} (${response.status})`;
}

export default function AdminPage() {
  const [access, setAccess] = useState<AccessState>("loading");
  const [resources, setResources] = useState<Resource[]>([]);
  const [learningPacks, setLearningPacks] = useState<LearningPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<PackDetail | null>(null);
  const [packImageFailed, setPackImageFailed] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ResourceForm>({
    title: "", url: "", type: RESOURCE_TYPES[0], topicKey: TOPICS[0], description: "",
    showOnDashboard: false, showInResources: true,
  });
  const [packForm, setPackForm] = useState<PackForm>({
    title: "", imageUrl: "", description: "", youtubeUrl: "", openingMatchTag: "",
  });
  const [gameForm, setGameForm] = useState<GameForm>(emptyGame);
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState("FREE");

  async function loadPacks() {
    const response = await fetch(`${API_BASE_URL}/api/admin/learning-packs`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await responseError(response, "Failed to load learning packs"));
    setLearningPacks((await response.json()) as LearningPack[]);
  }

  async function openPack(pack: LearningPack | { id: number }) {
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/learning-packs/${pack.id}`, { headers: authHeaders() });
    if (!response.ok) {
      setError(await responseError(response, "Failed to load pack details"));
      return;
    }
    setSelectedPack((await response.json()) as PackDetail);
    setPackImageFailed(false);
    setGameForm(emptyGame);
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/resources`, { headers: authHeaders() })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setAccess("denied");
          return null;
        }
        if (!response.ok) throw new Error(await responseError(response, "Failed to load resources"));
        return (await response.json()) as Resource[];
      })
      .then(async (data) => {
        if (!data) return;
        setResources(data);
        setAccess("allowed");
        try {
          await loadPacks();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load learning packs");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load resources");
        setAccess("allowed");
      });
  }, []);

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/admin/resources`, {
      method: "POST", headers: authHeaders(true), body: JSON.stringify(form),
    });
    if (!response.ok) {
      setError(await responseError(response, "Failed to add resource"));
      return;
    }
    const created = (await response.json()) as Resource;
    setResources((current) => [created, ...current]);
    setForm({ title: "", url: "", type: RESOURCE_TYPES[0], topicKey: TOPICS[0], description: "", showOnDashboard: false, showInResources: true });
  }

  async function addLearningPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/admin/learning-packs`, {
      method: "POST", headers: authHeaders(true),
      body: JSON.stringify({
        title: packForm.title,
        description: packForm.description || null,
        imageUrl: packForm.imageUrl || null,
        youtubeUrl: packForm.youtubeUrl || null,
        openingMatchTag: packForm.openingMatchTag || null,
      }),
    });
    if (!response.ok) {
      setError(await responseError(response, "Failed to add learning pack"));
      return;
    }
    const created = (await response.json()) as LearningPack;
    setLearningPacks((current) => [created, ...current]);
    setPackForm({ title: "", imageUrl: "", description: "", youtubeUrl: "", openingMatchTag: "" });
    await openPack(created);
  }

  async function deleteLearningPack(id: number) {
    if (!window.confirm("Delete this learning pack?")) return;
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/admin/learning-packs/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) {
      setError(await responseError(response, "Failed to delete learning pack"));
      return;
    }
    setLearningPacks((current) => current.filter((pack) => pack.id !== id));
    if (selectedPack?.id === id) setSelectedPack(null);
  }

  async function addPackGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPack) return;
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/admin/learning-packs/${selectedPack.id}/games`, {
      method: "POST", headers: authHeaders(true), body: JSON.stringify(gameForm),
    });
    if (!response.ok) {
      setError(await responseError(response, "Failed to add GM game"));
      return;
    }
    const created = (await response.json()) as PackDetail["games"][number];
    setSelectedPack((current) => current ? { ...current, games: [...current.games, created] } : current);
    setGameForm(emptyGame);
  }

  async function deletePackGame(gameId: number) {
    if (!selectedPack || !window.confirm("Delete this GM game?")) return;
    const response = await fetch(`${API_BASE_URL}/api/admin/learning-packs/games/${gameId}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) {
      setError(await responseError(response, "Failed to delete GM game"));
      return;
    }
    setSelectedPack((current) => current ? { ...current, games: current.games.filter((game) => game.id !== gameId) } : current);
  }

  async function deleteResource(id: number) {
    if (!window.confirm("Delete this resource?")) return;
    const response = await fetch(`${API_BASE_URL}/api/admin/resources/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) {
      setError(await responseError(response, "Failed to delete resource"));
      return;
    }
    setResources((current) => current.filter((resource) => resource.id !== id));
  }

  async function setUserPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(userId)}/plan`, {
      method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ plan }),
    });
    if (!response.ok) {
      setError(await responseError(response, "Failed to set plan"));
      return;
    }
    setUserId("");
  }

  if (access !== "allowed") return null;
  const previewUrl = packForm.imageUrl.trim();

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-16">
      <h1 className="mb-8 font-serif text-3xl">Admin</h1>
      {error && <p className="mb-4 border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mb-10">
        <h2 className="mb-4 font-serif text-xl">Curated resources</h2>
        <form onSubmit={addResource} className="mb-8 grid gap-3 border border-hairline p-4 md:grid-cols-2">
          <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border border-hairline bg-background p-2 text-sm" />
          <input required type="url" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="border border-hairline bg-background p-2 text-sm" />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Resource["type"] })} className="border border-hairline bg-background p-2 text-sm">{RESOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
          <select value={form.topicKey} onChange={(e) => setForm({ ...form, topicKey: e.target.value as Resource["topicKey"] })} className="border border-hairline bg-background p-2 text-sm">{TOPICS.map((topic) => <option key={topic}>{topic}</option>)}</select>
          <textarea required placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-24 border border-hairline bg-background p-2 text-sm md:col-span-2" />
          <fieldset className="flex gap-5 text-sm md:col-span-2"><legend className="sr-only">Visibility</legend><label className="flex items-center gap-2"><input type="checkbox" checked={form.showOnDashboard} onChange={(e) => setForm({ ...form, showOnDashboard: e.target.checked })} />Dashboard</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.showInResources} onChange={(e) => setForm({ ...form, showInResources: e.target.checked })} />Resources</label></fieldset>
          <button className="w-fit bg-board px-4 py-2 text-sm text-white">Add resource</button>
        </form>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-hairline text-left text-foreground/50"><th className="py-2 pr-4">Title</th><th className="pr-4">Type</th><th className="pr-4">Topic</th><th className="pr-4">URL</th><th /></tr></thead><tbody>{resources.map((resource) => <tr key={resource.id} className="border-b border-hairline"><td className="py-3 pr-4">{resource.title}</td><td className="pr-4">{resource.type}</td><td className="pr-4">{resource.topicKey}</td><td className="max-w-48 truncate pr-4"><a href={resource.url} target="_blank" rel="noreferrer" className="text-board underline">{resource.url}</a></td><td><button type="button" onClick={() => void deleteResource(resource.id)} className="text-xs text-red-700 hover:underline">Delete</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 font-serif text-xl">Learning packs</h2>
        <form onSubmit={addLearningPack} className="mb-8 grid gap-4 border border-hairline p-5">
          <label className="grid gap-1 text-sm font-medium">Name (required)<input required value={packForm.title} onChange={(e) => setPackForm({ ...packForm, title: e.target.value })} className="border border-hairline bg-background p-2 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Cover photo URL<input type="url" value={packForm.imageUrl} onChange={(e) => { setPackForm({ ...packForm, imageUrl: e.target.value }); setPackImageFailed(false); }} className="border border-hairline bg-background p-2 font-normal" /></label>
          {previewUrl && !packImageFailed ? <img src={previewUrl} alt="Cover preview" className="h-32 w-52 object-cover" onError={() => setPackImageFailed(true)} /> : previewUrl ? <div className="flex h-32 w-52 items-center justify-center border border-dashed border-hairline text-center text-xs text-foreground/60">Cover preview unavailable</div> : null}
          <label className="grid gap-1 text-sm font-medium">Description<textarea value={packForm.description} onChange={(e) => setPackForm({ ...packForm, description: e.target.value })} className="min-h-20 border border-hairline bg-background p-2 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Opening match tag<input value={packForm.openingMatchTag} onChange={(e) => setPackForm({ ...packForm, openingMatchTag: e.target.value })} className="border border-hairline bg-background p-2 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">YouTube URL<input type="url" value={packForm.youtubeUrl} onChange={(e) => setPackForm({ ...packForm, youtubeUrl: e.target.value })} className="border border-hairline bg-background p-2 font-normal" /></label>
          <button className="w-fit bg-board px-4 py-2 text-sm text-white">Create learning pack</button>
        </form>
        <div className="mb-8 space-y-2">{learningPacks.map((pack) => <div key={pack.id} className="flex items-center justify-between gap-3 border border-hairline p-3"><button type="button" onClick={() => void openPack(pack)} className="text-left font-serif text-lg text-board underline">{pack.title}</button><button type="button" onClick={() => void deleteLearningPack(pack.id)} className="text-xs text-red-700 hover:underline">Delete</button></div>)}</div>

        {selectedPack && (
          <section className="border border-board/40 p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex gap-4">{selectedPack.imageUrl && !packImageFailed ? <img src={selectedPack.imageUrl} alt="" className="h-24 w-36 object-cover" onError={() => setPackImageFailed(true)} /> : <div className="flex h-24 w-36 items-center justify-center border border-dashed border-hairline text-xs text-foreground/60">No cover image</div>}<div><h3 className="font-serif text-2xl">{selectedPack.title}</h3><p className="text-sm text-foreground/70">{selectedPack.description || "No description."}</p></div></div>
              <button type="button" onClick={() => setSelectedPack(null)} className="text-sm text-foreground/60 underline">Close</button>
            </div>
            <section><h4 className="mb-3 font-serif text-xl">GM Games</h4>{selectedPack.games.length === 0 ? <p className="mb-4 text-sm text-foreground/60">No games added yet.</p> : <div className="mb-4 space-y-2">{selectedPack.games.map((game) => <div key={game.id} className="flex items-start justify-between gap-3 border-t border-hairline py-2"><div><p className="font-medium">{game.title}</p><p className="text-sm text-foreground/60">{game.description || "No description."}</p></div><button type="button" onClick={() => void deletePackGame(game.id)} className="text-xs text-red-700 hover:underline">Delete game</button></div>)}</div>}<form onSubmit={addPackGame} className="grid gap-2 md:grid-cols-2"><input required placeholder="Game title" value={gameForm.title} onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })} className="border border-hairline bg-background p-2 text-sm" /><input placeholder="Description" value={gameForm.description} onChange={(e) => setGameForm({ ...gameForm, description: e.target.value })} className="border border-hairline bg-background p-2 text-sm" /><textarea required placeholder="PGN" value={gameForm.pgn} onChange={(e) => setGameForm({ ...gameForm, pgn: e.target.value })} className="min-h-32 border border-hairline bg-background p-2 font-mono text-xs md:col-span-2" /><button className="w-fit border border-board px-4 py-2 text-sm text-board">Add game</button></form></section>
          </section>
        )}
      </section>

      <section className="max-w-xl"><h2 className="mb-4 font-serif text-xl">User plan</h2><form onSubmit={setUserPlan} className="flex flex-wrap gap-3"><input required placeholder="User email or ID" value={userId} onChange={(e) => setUserId(e.target.value)} className="min-w-56 flex-1 border border-hairline bg-background p-2 text-sm" /><select value={plan} onChange={(e) => setPlan(e.target.value)} className="border border-hairline bg-background p-2 text-sm"><option>FREE</option><option>PRO</option><option>ULTIMATE</option></select><button className="bg-board px-4 py-2 text-sm text-white">Set Plan</button></form></section>
    </div>
  );
}
