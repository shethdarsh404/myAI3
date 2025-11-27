"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Square, PlusIcon, Eraser } from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { AI_NAME, CLEAR_CHAT_TEXT, OWNER_NAME, WELCOME_MESSAGE } from "@/config";

import Link from "next/link";

/* ---------------- constants + storage keys ---------------- */

const STORAGE_KEY = "chat-messages";
const SAVED_CONVS_KEY = "nutribuddy-saved-convs";
const PROFILE_KEY = "nutribuddy-profile";
const TODAY_LOG_KEY = "nutribuddy-today-log";
const GOALS_KEY = "nutribuddy-goals";

const formSchema = z.object({
  message: z.string().min(1).max(2000),
});

/* ---------------- small helpers ---------------- */

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function dateFmt(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/* ---------------- parse nutrients from text ---------------- */

function parseNutrientsFromText(text: string | undefined | null) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const kcalMatch = lower.match(/(\d{2,5})\s?kcal/);
  const proteinMatch = lower.match(/(\d{1,4})\s?g\s?(?:protein)?/);
  const carbsMatch = lower.match(/(\d{1,4})\s?g\s?(?:carb|carbs|carbohydrate)?/);
  const fatMatch = lower.match(/(\d{1,4})\s?g\s?(?:fat)?/);

  const kcal = kcalMatch ? Number(kcalMatch[1]) : null;
  const protein = proteinMatch ? Number(proteinMatch[1]) : null;
  const carbs = carbsMatch ? Number(carbsMatch[1]) : null;
  const fat = fatMatch ? Number(fatMatch[1]) : null;

  return { kcal, protein, carbs, fat };
}

/* ---------------- today log persistence ---------------- */

const todayIso = () => new Date().toISOString().slice(0, 10);

type TodayLog = { dateIso: string; kcal: number; protein: number; carbs: number; fat: number; };

function loadTodayLog(): TodayLog {
  try {
    const raw = localStorage.getItem(TODAY_LOG_KEY);
    if (!raw) return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const parsed = JSON.parse(raw) as TodayLog;
    if (parsed.dateIso !== todayIso()) return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return parsed;
  } catch {
    return { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
}
function saveTodayLog(log: TodayLog) { localStorage.setItem(TODAY_LOG_KEY, JSON.stringify(log)); }

/* ---------------- small UI component ---------------- */

function ProgressBar({ value, target, color = "#34D399" }: { value: number; target: number; color?: string }) {
  const pct = target > 0 ? clamp((value / target) * 100, 0, 200) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
        <div className="font-medium" style={{ color: "#0f172a" }}>{Math.round(value)} g</div>
        <div className="text-xs text-slate-400">{Math.round(target)} g</div>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div style={{ width: `${pct}%`, background: color, height: "100%", transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}

/* ---------------- main page ---------------- */

export default function ChatPage() {
  // stored
  const storedDefault = typeof window !== "undefined" ? (() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return { messages: [], durations: {} }; const p = JSON.parse(raw); return { messages: p.messages || [], durations: p.durations || {} }; } catch { return { messages: [], durations: {} }; }
  })() : { messages: [], durations: {} };

  const [initialMessages] = useState<UIMessage[]>(storedDefault.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(storedDefault.durations || {});
  const [savedConversations, setSavedConversations] = useState<any[]>(() => { try { const raw = localStorage.getItem(SAVED_CONVS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }});
  const [profile, setProfile] = useState(() => { try { const raw = localStorage.getItem(PROFILE_KEY); return raw ? JSON.parse(raw) : { name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" }; } catch { return { name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" }; }});
  const [goals, setGoals] = useState(() => { try { const raw = localStorage.getItem(GOALS_KEY); return raw ? JSON.parse(raw) : { kcal: 2000, proteinG: 120, carbsG: 300, fatG: 70 }; } catch { return { kcal: 2000, proteinG: 120, carbsG: 300, fatG: 70 }; }});
  const [todayLog, setTodayLog] = useState<TodayLog>(() => loadTodayLog());

  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<{ message: string }>({ resolver: zodResolver(formSchema), defaultValues: { message: "" } });

  // persist messages
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations })); } catch {}
  }, [messages, durations]);

  // smart autoscroll: only scroll if near bottom
  useEffect(() => {
    try {
      const container = messagesContainerRef.current;
      if (!container) { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); return; }
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const NEAR_BOTTOM_THRESHOLD = 150;
      if (distanceFromBottom <= NEAR_BOTTOM_THRESHOLD) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function handleDurationChange(key: string, duration: number) {
    setDurations(prev => ({ ...prev, [key]: duration }));
  }

  // today log helpers
  function persistToday(next: TodayLog) { setTodayLog(next); saveTodayLog(next); }
  function addToToday({ kcal = 0, protein = 0, carbs = 0, fat = 0 }: { kcal?: number; protein?: number; carbs?: number; fat?: number }) {
    const cur = loadTodayLog();
    const next = { dateIso: todayIso(), kcal: Math.round((cur.kcal || 0) + (kcal || 0)), protein: Math.round((cur.protein || 0) + (protein || 0)), carbs: Math.round((cur.carbs || 0) + (carbs || 0)), fat: Math.round((cur.fat || 0) + (fat || 0)) };
    persistToday(next);
    toast.success("Added to today's log");
  }

  function parseAndAddFromText(text: string | undefined | null) {
    if (!text) { toast.error("No text provided"); return; }
    const parsed = parseNutrientsFromText(text);
    if (!parsed) { toast.error("Could not parse nutrients from text"); return; }
    let { kcal, protein, carbs, fat } = parsed;
    // if only kcal given, crudely estimate macros proportionally to goals
    if (kcal && (!protein && !carbs && !fat)) {
      const totalGoalCals = goals.kcal || 2000;
      const proteinCals = (goals.proteinG || 0) * 4;
      const fatCals = (goals.fatG || 0) * 9;
      const carbsCals = Math.max(0, totalGoalCals - proteinCals - fatCals);
      const pRatio = proteinCals / totalGoalCals;
      const fRatio = fatCals / totalGoalCals;
      const cRatio = carbsCals / totalGoalCals;
      protein = Math.round((kcal * pRatio) / 4);
      fat = Math.round((kcal * fRatio) / 9);
      carbs = Math.round((kcal * cRatio) / 4);
    } else {
      if (!kcal) kcal = (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9;
    }
    addToToday({ kcal: kcal || 0, protein: protein || 0, carbs: carbs || 0, fat: fat || 0 });
  }

  function addComposerToLog() {
    const txt = form.getValues()?.message?.trim();
    if (!txt) return toast.error("Composer is empty");
    parseAndAddFromText(txt);
  }

  function addLastAssistantToLog() {
    const assistantMsgs = (messages || []).filter((m: any) => m.role === "assistant");
    if (!assistantMsgs.length) return toast.error("No assistant messages found");
    const last = assistantMsgs[assistantMsgs.length - 1];
    const text = last?.parts?.map((p: any) => p.text).join(" ") || (last as any).text || "";
    parseAndAddFromText(text);
  }

  // save / load convs
  function saveCurrentConversation() {
    const title = window.prompt("Enter title for this conversation", `Chat ${new Date().toLocaleString()}`);
    if (!title) return;
    const conv = { id: `conv-${Date.now()}`, title, createdAt: new Date().toISOString(), messages: messages || [] };
    const next = [conv, ...savedConversations].slice(0, 50);
    setSavedConversations(next);
    localStorage.setItem(SAVED_CONVS_KEY, JSON.stringify(next));
    toast.success("Conversation saved");
  }
  function loadConversation(conv: any) { setMessages(conv.messages); localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: conv.messages, durations })); toast.success(`Loaded "${conv.title}"`); }
  function deleteConversation(id: string) { const next = savedConversations.filter(c => c.id !== id); setSavedConversations(next); localStorage.setItem(SAVED_CONVS_KEY, JSON.stringify(next)); toast.success("Deleted"); }

  // suggested meals sample
  const suggestedMeals = [
    { title: "Grilled paneer bowl", kcal: 420, protein: 30, carbs: 40, fat: 10 },
    { title: "Quinoa salad with roasted veg", kcal: 350, protein: 12, carbs: 50, fat: 10 },
    { title: "Chickpea curry + brown rice", kcal: 560, protein: 20, carbs: 80, fat: 12 },
  ];

  return (
    <div className="min-h-screen font-sans antialiased bg-slate-50">
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6">
        {/* LEFT */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">🥗</div>
                <div>
                  <div className="text-sm font-semibold">Personal data</div>
                  <div className="text-xs text-slate-500">Saved locally</div>
                </div>
              </div>
              <button className="text-xs text-slate-600" onClick={() => document.getElementById("profile-name")?.focus()}>Edit</button>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <label className="flex flex-col">
                <span className="text-xs text-slate-500">Name</span>
                <input
                  id="profile-name"
                  value={profile.name || ""}
                  onChange={(e) => {
                    // annotate p with any to avoid implicit any TypeScript error
                    setProfile((p: any) => ({ ...p, name: e.target.value }));
                    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, name: e.target.value }));
                  }}
                  className="input mt-1"
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Age</span>
                  <input
                    value={profile.age || ""}
                    onChange={(e) => {
                      setProfile((p: any) => ({ ...p, age: e.target.value }));
                      localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, age: e.target.value }));
                    }}
                    className="input mt-1"
                  />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Height (cm)</span>
                  <input
                    value={profile.heightCm || ""}
                    onChange={(e) => {
                      setProfile((p: any) => ({ ...p, heightCm: e.target.value }));
                      localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, heightCm: e.target.value }));
                    }}
                    className="input mt-1"
                  />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="text-slate-500">Weight (kg)</span>
                  <input
                    value={profile.weightKg || ""}
                    onChange={(e) => {
                      setProfile((p: any) => ({ ...p, weightKg: e.target.value }));
                      localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, weightKg: e.target.value }));
                    }}
                    className="input mt-1"
                  />
                </label>
              </div>

              <label className="flex flex-col text-xs">
                <span className="text-slate-500">Activity level</span>
                <select
                  value={profile.activity || "Moderate"}
                  onChange={(e) => {
                    setProfile((p: any) => ({ ...p, activity: e.target.value }));
                    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, activity: e.target.value }));
                  }}
                  className="input mt-1"
                >
                  <option>Sedentary</option>
                  <option>Light</option>
                  <option>Moderate</option>
                  <option>Active</option>
                </select>
              </label>

              <div className="flex items-center gap-2 mt-2">
                <button className="px-3 py-1 rounded-md border border-slate-200 text-sm" onClick={() => { toast.success("Estimated (demo)"); }}>Estimate goals</button>
                <button className="px-3 py-1 rounded-md text-sm" onClick={() => { setProfile({ name: "", age: "", heightCm: "", weightKg: "", activity: "Moderate" }); localStorage.removeItem(PROFILE_KEY); toast.success("Profile cleared"); }}>Reset</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow border border-slate-100 flex-1 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Past chats</div>
              <div className="text-xs text-slate-400">{savedConversations.length} saved</div>
            </div>

            {savedConversations.length === 0 ? <div className="text-xs text-slate-400">No saved conversations</div> : (
              <ul className="space-y-2">
                {savedConversations.map((c: any) => (
                  <li key={c.id} className="p-2 rounded-lg border border-slate-100 hover:bg-slate-50 flex items-start justify-between">
                    <div className="flex-1">
                      <button onClick={() => loadConversation(c)} className="text-sm font-medium text-slate-800 text-left">{c.title}</button>
                      <div className="text-xs text-slate-400">{dateFmt(c.createdAt)}</div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">{c.messages?.length ? (c.messages[c.messages.length - 1].parts?.map((p: any) => p.text).join(" ") || "").slice(0, 90) : ""}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button onClick={() => loadConversation(c)} className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">Open</button>
                      <button onClick={() => deleteConversation(c.id)} className="text-xs text-red-500">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* CENTER chat: fixed height so right side doesn't drop */}
        <section className="col-span-12 lg:col-span-6 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-5 shadow border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">🥗</div>
              <div>
                <h1 className="text-xl font-semibold">NutriBuddy</h1>
                <p className="text-xs text-slate-500">Personalized nutrition chat</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-3 py-1 border border-slate-200 rounded-md" onClick={saveCurrentConversation}><PlusIcon className="mr-1" /> Save</button>
              <button className="px-3 py-1 border border-slate-200 rounded-md" onClick={() => { setMessages([]); toast.success("Cleared"); }}>Clear</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col h-[72vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar><AvatarImage src="/logo.png" /><AvatarFallback>NB</AvatarFallback></Avatar>
                <div>
                  <div className="text-sm font-medium">Conversation</div>
                  <div className="text-xs text-slate-400">Chat with {AI_NAME}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400">Status: {status}</div>
            </div>

            {/* messages area scrolls internally and won't push layout */}
            <div className="flex-1 overflow-y-auto px-4 py-5" ref={messagesContainerRef}>
              <div className="max-w-3xl mx-auto flex flex-col gap-4">
                <MessageWall {...({ messages, status, durations, onDurationChange: handleDurationChange, onAddToLog: parseAndAddFromText } as any)} />
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* composer fixed inside chat card */}
            <div className="bg-white px-4 py-4 border-t border-slate-100">
              <form onSubmit={form.handleSubmit((d) => { sendMessage({ text: d.message }); form.reset(); })} className="max-w-3xl mx-auto">
                <FieldGroup>
                  <Controller
                    name="message"
                    control={form.control}
                    render={({ field }) => (
                      <div className="relative flex items-center gap-3">
                        <Input
                          {...field}
                          placeholder="Type: 'Grilled paneer — 420 kcal, 30g protein, 40g carbs, 10g fat'"
                          className="flex-1 h-12 rounded-full border border-slate-200 shadow-sm px-4"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              form.handleSubmit((d) => { sendMessage({ text: d.message }); form.reset(); })();
                            }
                          }}
                        />

                        {/* smaller darker send button */}
                        <button
                          type="submit"
                          disabled={!field.value.trim()}
                          className="ml-2 inline-flex items-center justify-center rounded-full w-10 h-10 bg-emerald-700 hover:bg-emerald-800 text-white shadow"
                          title="Send"
                        >
                          <ArrowUp className="size-4" />
                        </button>

                        {/* stop button when streaming */}
                        {(status === "streaming" || status === "submitted") && (
                          <button type="button" onClick={() => stop()} className="ml-2 inline-flex items-center justify-center rounded-full w-10 h-10 bg-slate-100 text-slate-700" title="Stop">
                            <Square className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                  />
                </FieldGroup>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { form.setValue("message", "Create a 1800 kcal vegetarian day plan"); toast.success("Prompt loaded"); }} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm">Create a 1800 kcal plan</button>
                  <button type="button" onClick={() => { form.setValue("message", "High-protein snack ideas"); toast.success("Prompt loaded"); }} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm">High-protein snack ideas</button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* RIGHT column: same visual height as chat to avoid drop */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-5">
          <div className="bg-white rounded-xl p-5 shadow border border-slate-100 h-[72vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Today's snapshot</h3>
                <p className="text-xs text-slate-400">Log & targets</p>
              </div>
              <div className="text-xs text-slate-400">{todayIso()}</div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div>
                <svg width="84" height="84">
                  <defs>
                    <linearGradient id="g-c" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#34D399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  <g transform="translate(42,42)">
                    <circle r="32" fill="transparent" stroke="#EEF6F0" strokeWidth="10" />
                    <circle r="32" fill="transparent" stroke="url(#g-c)" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 32}`} strokeDashoffset={`${2 * Math.PI * 32 * (1 - clamp(todayLog.kcal / (goals.kcal || 1), 0, 1))}`} transform="rotate(-90)" />
                    <text textAnchor="middle" dy="6" style={{ fontSize: 12, fontWeight: 700, fill: "#065F46" }}>{Math.round((todayLog.kcal / (goals.kcal || 1)) * 100)}%</text>
                  </g>
                </svg>
              </div>

              <div className="flex-1">
                <div className="text-sm font-semibold">{todayLog.kcal} kcal logged</div>
                <div className="text-xs text-slate-400 mt-1">Goal: {goals.kcal}</div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Protein (g)</div>
                    <ProgressBar value={todayLog.protein} target={goals.proteinG} color="#F97316" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Carbs (g)</div>
                    <ProgressBar value={todayLog.carbs} target={goals.carbsG} color="#60A5FA" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Fat (g)</div>
                    <ProgressBar value={todayLog.fat} target={goals.fatG} color="#F472B6" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col text-xs"><span className="text-slate-500">Calorie goal</span><input type="number" className="input mt-1" value={goals.kcal ?? ""} onChange={(e) => { const n = e.target.value === "" ? 0 : Number(e.target.value); setGoals({ ...goals, kcal: n }); localStorage.setItem(GOALS_KEY, JSON.stringify({ ...goals, kcal: n })); }} /></label>
              <label className="flex flex-col text-xs"><span className="text-slate-500">Protein (g)</span><input type="number" className="input mt-1" value={goals.proteinG ?? ""} onChange={(e) => { const n = e.target.value === "" ? 0 : Number(e.target.value); setGoals({ ...goals, proteinG: n }); localStorage.setItem(GOALS_KEY, JSON.stringify({ ...goals, proteinG: n })); }} /></label>
              <label className="flex flex-col text-xs"><span className="text-slate-500">Carbs (g)</span><input type="number" className="input mt-1" value={goals.carbsG ?? ""} onChange={(e) => { const n = e.target.value === "" ? 0 : Number(e.target.value); setGoals({ ...goals, carbsG: n }); localStorage.setItem(GOALS_KEY, JSON.stringify({ ...goals, carbsG: n })); }} /></label>
              <label className="flex flex-col text-xs"><span className="text-slate-500">Fat (g)</span><input type="number" className="input mt-1" value={goals.fatG ?? ""} onChange={(e) => { const n = e.target.value === "" ? 0 : Number(e.target.value); setGoals({ ...goals, fatG: n }); localStorage.setItem(GOALS_KEY, JSON.stringify({ ...goals, fatG: n })); }} /></label>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="px-3 py-2 rounded-md bg-emerald-700 text-white" onClick={() => addComposerToLog()}>Add Data from Prompt</button>
              <button className="px-3 py-2 rounded-md border border-slate-200" onClick={() => addLastAssistantToLog()}>Add Last Data</button>
              <button className="px-3 py-2 rounded-md text-sm" onClick={() => { const empty = { dateIso: todayIso(), kcal: 0, protein: 0, carbs: 0, fat: 0 }; persistToday(empty); toast.success("Reset"); }}>Reset</button>
            </div>

            {/* Suggested meals */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Suggested meals</div>
                <div className="text-xs text-slate-400">Quick add</div>
              </div>

              <div className="mt-3 space-y-3">
                {suggestedMeals.map((m) => (
                  <div key={m.title} className="flex items-center justify-between p-3 rounded-md border border-slate-100 bg-white">
                    <div>
                      <div className="text-sm font-medium">{m.title}</div>
                      <div className="text-xs text-slate-400 mt-1">{m.kcal} kcal · {m.protein}g P · {m.carbs}g C</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1 rounded-md border border-slate-200 text-xs" onClick={() => { form.setValue("message", `${m.title} — ${m.kcal} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat`); toast.success("Loaded into composer"); }}>Load</button>
                      <button className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs" onClick={() => addToToday({ kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat })}>Add</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 text-xs text-slate-400">© {new Date().getFullYear()} {OWNER_NAME}</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
