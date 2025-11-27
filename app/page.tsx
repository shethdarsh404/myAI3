"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Loader2, Square, PlusIcon, Eraser } from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { ChatHeader } from "@/app/parts/chat-header";
import { ChatHeaderBlock } from "@/app/parts/chat-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import {
  AI_NAME,
  CLEAR_CHAT_TEXT,
  OWNER_NAME,
  WELCOME_MESSAGE,
} from "@/config";

import Image from "next/image";
import Link from "next/link";

/* ---------------- validation + storage ---------------- */

const formSchema = z.object({
  message: z.string().min(1).max(2000),
});

const STORAGE_KEY = "chat-messages";

type StorageData = {
  messages: UIMessage[];
  durations: Record<string, number>;
};

const loadMessagesFromStorage = (): StorageData => {
  if (typeof window === "undefined") return { messages: [], durations: {} };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { messages: [], durations: {} };
    const parsed = JSON.parse(stored) as StorageData;
    return {
      messages: parsed.messages || [],
      durations: parsed.durations || {},
    };
  } catch (error) {
    // If malformed, return empty safely
    // eslint-disable-next-line no-console
    console.error("Failed to load messages from localStorage:", error);
    return { messages: [], durations: {} };
  }
};

const saveMessagesToStorage = (messages: UIMessage[], durations: Record<string, number>) => {
  if (typeof window === "undefined") return;
  try {
    const data: StorageData = { messages, durations };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save messages to localStorage:", error);
  }
};

/* ---------------- small UI helper ---------------- */

function ProgressRing({ size = 96, stroke = 10, progress = 0 }: { size?: number; stroke?: number; progress: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} className="block">
      <defs>
        <linearGradient id="nutri-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={radius} fill="transparent" stroke="#EEF6F0" strokeWidth={stroke} />
        <circle
          r={radius}
          fill="transparent"
          stroke="url(#nutri-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform="rotate(-90)"
        />
        <text textAnchor="middle" dy="6" style={{ fontSize: 14, fontWeight: 600, fill: "#065F46" }}>
          {Math.round(progress)}%
        </text>
      </g>
    </svg>
  );
}

/* ---------------- page component ---------------- */

export default function ChatPage() {
  const [isClient, setIsClient] = useState(false);
  const stored = typeof window !== "undefined" ? loadMessagesFromStorage() : { messages: [], durations: {} };
  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});
  const [isTyping, setIsTyping] = useState(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: initialMessages,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const welcomeShownRef = useRef<boolean>(false);

  useEffect(() => {
    // client mount
    setIsClient(true);
    setDurations(stored.durations || {});
    setMessages(stored.messages || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isClient) saveMessagesToStorage(messages, durations);
  }, [messages, durations, isClient]);

  useEffect(() => {
    if (isClient && initialMessages.length === 0 && !welcomeShownRef.current) {
      const welcome: UIMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_MESSAGE }],
      };
      setMessages([welcome]);
      saveMessagesToStorage([welcome], {});
      welcomeShownRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  // autoscroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDurationChange = (key: string, duration: number) => {
    setDurations((prev) => {
      const next = { ...prev };
      next[key] = duration;
      return next;
    });
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  function onSubmit(data: z.infer<typeof formSchema>) {
    // set quick UI typing indicator; useChat will handle response streaming
    setIsTyping(true);
    sendMessage({ text: data.message });
    form.reset();
    // fallback to hide typing if streaming takes long
    setTimeout(() => setIsTyping(false), 1200);
  }

  function clearChat() {
    setMessages([]);
    setDurations({});
    saveMessagesToStorage([], {});
    toast.success("Chat cleared");
  }

  // A tiny calorie parse (demo only) to power insights
  const latestCalories = (() => {
    const txt = messages
      .map((m) => {
        if (m.parts && m.parts.length) return m.parts.map((p: any) => p.text).join(" ");
        return (m as any).text || "";
      })
      .join(" ");
    const match = txt.match(/(\d{2,4})\s?k?c?a?l?/i);
    return match ? Number(match[1]) : null;
  })();

  // sample profile (demo)
  const profile = { calorieGoal: 2200 };

  const calorieProgress = Math.min(100, profile.calorieGoal ? ((latestCalories || 0) / profile.calorieGoal) * 100 : 0);

  const quickPrompts = [
    "Create a 1800 kcal vegetarian day plan",
    "High-protein snack ideas",
    "Count calories: 1 bowl rice, dal, salad",
  ];

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-12 gap-6">
        {/* left small nav (optional) */}
        <nav className="col-span-1 hidden lg:flex flex-col items-center gap-4 pt-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-slate-100 flex items-center justify-center">🥗</div>
          <div className="mt-auto text-xs text-slate-400">v1.0</div>
        </nav>

        {/* center chat */}
        <section className="col-span-12 lg:col-span-7 flex flex-col gap-5">
          {/* top hero */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center text-2xl">🥗</div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">NutriBuddy</h2>
                <p className="text-sm text-slate-500">Smart nutrition assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={clearChat}><Eraser className="size-4 mr-1" />Clear</Button>
              <Button size="sm" onClick={() => toast.success("Saved (demo)")}>Save</Button>
            </div>
          </div>

          {/* chat card with internal scroll + sticky composer */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 flex flex-col h-[72vh] overflow-hidden">
            {/* header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Avatar>
                    <AvatarImage src="/logo.png" />
                    <AvatarFallback>NB</AvatarFallback>
                  </Avatar>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">Conversation</div>
                  <div className="text-xs text-slate-500">Chat with {AI_NAME}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500">Status: {status}</div>
            </div>

            {/* messages: scroll inside this area */}
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="max-w-3xl mx-auto flex flex-col gap-4">
                <MessageWall messages={messages} status={status} durations={durations} onDurationChange={handleDurationChange} />

                {/* typing indicator */}
                {isTyping && (
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">AI</div>
                    <div className="px-3 py-2 rounded-lg bg-slate-100">NutriBuddy is typing…</div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* sticky composer */}
            <div className="sticky bottom-0 bg-white px-4 py-4 border-t border-slate-100">
              <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl mx-auto">
                <FieldGroup>
                  <Controller
                    name="message"
                    control={form.control}
                    render={({ field }) => (
                      <Field className="flex items-center gap-3">
                        <Input
                          {...field}
                          placeholder="Type something like: 'Build me a 1500 kcal vegetarian dinner'"
                          className="flex-1 h-14 rounded-full border border-slate-200 shadow-sm px-5"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              form.handleSubmit(onSubmit)();
                            }
                          }}
                        />

                        {(status === "ready" || status === "error") && (
                          <Button type="submit" size="icon" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md" disabled={!field.value.trim()}>
                            <ArrowUp className="size-4 text-white" />
                          </Button>
                        )}

                        {(status === "streaming" || status === "submitted") && (
                          <Button size="icon" className="rounded-full bg-slate-100" onClick={() => stop()}>
                            <Square className="size-4 text-slate-700" />
                          </Button>
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>

                <div className="mt-3 flex flex-wrap gap-2">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        form.setValue("message", q);
                        toast.success("Prompt loaded — press Enter to send");
                      }}
                      className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm hover:bg-emerald-100 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* right insights */}
        <aside className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Today's snapshot</h3>
            <p className="text-xs text-slate-500 mt-1">Calories & macros</p>

            <div className="mt-4 flex items-center gap-4">
              <ProgressRing size={104} stroke={10} progress={calorieProgress} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{latestCalories ? `${latestCalories} kcal logged` : "No calories logged"}</div>
                <div className="text-xs text-slate-500 mt-2">Goal: {profile.calorieGoal || 2200} kcal</div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-800">Protein</div>
                    <div className="text-xs text-slate-500">30g</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-800">Carbs</div>
                    <div className="text-xs text-slate-500">60g</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-800">Fat</div>
                    <div className="text-xs text-slate-500">20g</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success("Exported (demo)")}>Export</Button>
              <Button size="sm" onClick={() => toast.success("Saved (demo)")}>Save</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Suggested meals</h3>
            <ul className="mt-3 space-y-3">
              {[
                { title: "Grilled paneer bowl", kcal: 420 },
                { title: "Quinoa salad with roasted veg", kcal: 350 },
                { title: "Chickpea curry + brown rice", kcal: 560 },
              ].map((m) => (
                <li key={m.title} className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100 shadow-sm">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{m.title}</div>
                    <div className="text-xs text-slate-500">{m.kcal} kcal</div>
                  </div>
                  <div>
                    <button
                      className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm"
                      onClick={() => {
                        form.setValue("message", `Recipe: ${m.title} — portions and calories please.`);
                        toast.success("Loaded into composer (press Enter)");
                      }}
                    >
                      Load
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-xs text-slate-500">
            © {new Date().getFullYear()} {OWNER_NAME} • <Link href="/terms" className="underline">Terms</Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
