"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MessageWall } from "@/components/messages/message-wall";
import { ArrowUp, Square } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { UIMessage } from "ai";
import { OWNER_NAME } from "@/config";

/*
  Clean, minimal chat UI
  - centered 16:9-like container ~80% viewport
  - neutral palette, simple layout
  - accessible, compact components
*/

const schema = z.object({ message: z.string().min(1).max(2000) });
const STORAGE_KEY = "chat-messages-clean";

type StorageData = { messages: UIMessage[]; durations: Record<string, number>; userProfile?: any };

const load = (): StorageData => {
  if (typeof window === "undefined") return { messages: [], durations: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { messages: [], durations: {} };
  } catch (e) {
    console.error(e);
    return { messages: [], durations: {} };
  }
};
const save = (data: StorageData) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.error(e); }
};

export default function ChatPage() {
  const [isReady, setIsReady] = useState(false);
  const stored = typeof window !== "undefined" ? load() : { messages: [], durations: {} };
  const [initialMessages] = useState<UIMessage[]>(stored.messages || []);
  const [durations, setDurations] = useState<Record<string, number>>(stored.durations || {});

  const { messages, sendMessage, status, stop, setMessages } = useChat({ messages: initialMessages });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsReady(true);
    setMessages(stored.messages || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isReady) return;
    save({ messages, durations });
  }, [messages, durations, isReady]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { message: '' } });

  const onSubmit = (d: z.infer<typeof schema>) => {
    sendMessage({ text: d.message });
    form.reset();
  };

  const clearChat = () => {
    setMessages([]);
    setDurations({});
    save({ messages: [], durations: {} });
    toast && toast.success?.('Cleared');
  };

  const latestCalories = (() => {
    const text = messages.map(m => m.parts?.map((p:any) => p.text).join(' ') || '').join(' ');
    const m = text.match(/(\d{2,4})\s?k?c?a?l?/i);
    return m ? Number(m[1]) : 0;
  })();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}>
      <div
        className="w-[85vw] max-w-[1400px] rounded-2xl shadow-2xl ring-1 ring-slate-100 overflow-hidden bg-white"
        style={{ height: 'calc(min(82vh, (85vw * 9) / 16))' }}
      >
        <div className="grid grid-cols-12 h-full">

          {/* Left: compact nav */}
          <aside className="hidden md:flex md:col-span-1 bg-white/60 border-r border-slate-100 items-center justify-center">
            <div className="flex flex-col items-center gap-3 mt-6 mb-6">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold">NB</div>
              <button title="Clear" onClick={clearChat} className="text-sm text-slate-600 hover:text-slate-900">Clear</button>
            </div>
          </aside>

          {/* Center: chat (bigger) */}
          <main className="col-span-12 md:col-span-7 lg:col-span-8 p-6 flex flex-col">
            <header className="flex items-center justify-between pb-4">
              <div>
                <h1 className="text-lg font-semibold text-slate-800">NutriBuddy — clean chat</h1>
                <p className="text-xs text-slate-500">Ask about meal plans, recipes, and tracking</p>
              </div>
              <div className="text-xs text-slate-500">Status: <span className="font-medium text-slate-700">{status}</span></div>
            </header>

            <div className="flex-1 overflow-y-auto rounded-md border border-slate-100 p-4 bg-white">
              <div className="flex flex-col gap-4 max-w-2xl mx-auto">
                <MessageWall messages={messages} status={status} durations={durations} onDurationChange={(k,v)=>{ setDurations(prev => ({...prev,[k]:v})); }} />

                {status === 'streaming' && (
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs">AI</div>
                    <div>NutriBuddy is typing…</div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="mt-4">
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-3 items-center">
                <FieldGroup className="flex-1">
                  <Controller name="message" control={form.control} render={({ field }) => (
                    <Field className="flex items-center">
                      <Input {...field} placeholder="Type a message (Enter to send)" className="h-12 px-4" onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); form.handleSubmit(onSubmit)(); } }} />
                    </Field>
                  )} />
                </FieldGroup>

                {status === 'ready' || status === 'error' ? (
                  <Button type="submit" size="icon" className="h-12 w-12 rounded-full bg-slate-800 text-white flex items-center justify-center">
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={()=>stop()} size="icon" className="h-12 w-12 rounded-full bg-slate-200 text-slate-700">
                    <Square className="w-4 h-4" />
                  </Button>
                )}
              </form>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <div className="flex gap-2">
                  <button type="button" onClick={()=>{ form.setValue('message','Build me a simple 1800 kcal vegetarian meal plan'); }} className="px-2 py-1 rounded bg-slate-100">Prompt 1</button>
                  <button type="button" onClick={()=>{ form.setValue('message','List high-protein snacks under 200 kcal'); }} className="px-2 py-1 rounded bg-slate-100">Prompt 2</button>
                </div>

                <div className="flex gap-2">
                  <button onClick={()=>toast?.success?.('Exported (demo)')} className="px-2 py-1 rounded bg-slate-50 border border-slate-100 text-slate-600">Export</button>
                  <Link href="/privacy" className="text-slate-400">Privacy</Link>
                </div>
              </div>
            </div>
          </main>

          {/* Right: compact insights */}
          <aside className="col-span-12 md:col-span-4 lg:col-span-3 border-l border-slate-100 p-6 bg-white/50">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Snapshot</h3>
                <p className="text-xs text-slate-500 mt-1">Calories detected: <span className="font-medium text-slate-700">{latestCalories}</span></p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-800">Quick actions</h3>
                <div className="mt-2 flex flex-col gap-2">
                  <button onClick={()=>{ form.setValue('message','Give me a 7-day vegetarian meal plan with macros'); toast?.success?.('Prompt loaded'); }} className="text-sm px-3 py-2 rounded bg-slate-100 text-slate-700 text-left">Load 7-day plan</button>
                  <button onClick={clearChat} className="text-sm px-3 py-2 rounded bg-red-50 text-red-700 text-left">Clear chat</button>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-400">
                © {new Date().getFullYear()} {OWNER_NAME}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
