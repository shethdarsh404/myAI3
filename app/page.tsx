"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  Eraser,
  Loader2,
  Plus,
  PlusIcon,
  Square,
} from "lucide-react";

import { MessageWall } from "@/components/messages/message-wall";
import { ChatHeader } from "@/app/parts/chat-header";
import { ChatHeaderBlock } from "@/app/parts/chat-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UIMessage } from "ai";
import { useEffect, useState, useRef } from "react";
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

const loadMessagesFromStorage = () => {
  if (typeof window === "undefined") return { messages: [], durations: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      messages: parsed.messages || [],
      durations: parsed.durations || {},
    };
  } catch {
    return { messages: [], durations: {} };
  }
};

const saveMessagesToStorage = (messages: any[], durations: any) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, durations }));
};


/* ---------------- APPLE UI PAGE ---------------- */

export default function ChatPage() {
  const [isClient, setIsClient] = useState(false);
  const [durations, setDurations] = useState({});
  const stored = typeof window !== "undefined" ? loadMessagesFromStorage() : { messages: [], durations: {} };
  const [initialMessages] = useState(stored.messages);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    messages: initialMessages,
  });

  const welcomeMessageShownRef = useRef(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  /* -------------------------------- handlers ------------------------------ */

  useEffect(() => {
    setIsClient(true);
    setDurations(stored.durations);
    setMessages(stored.messages);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isClient) return;
    saveMessagesToStorage(messages, durations);
  }, [messages, durations, isClient]);


  useEffect(() => {
    if (initialMessages.length === 0 && !welcomeMessageShownRef.current) {
      const welcome: UIMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: WELCOME_MESSAGE }],
      };
      setMessages([welcome]);
      saveMessagesToStorage([welcome], {});
      welcomeMessageShownRef.current = true;
    }
  }, [isClient]);


  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { message: "" },
  });

  function onSubmit(data: any) {
    setIsTyping(true);
    sendMessage({ text: data.message });
    form.reset();
    setTimeout(() => setIsTyping(false), 800);
  }

  function clearChat() {
    setMessages([]);
    setDurations({});
    saveMessagesToStorage([], {});
    toast.success("Chat cleared");
  }

  const quickPrompts = [
    "Create a balanced meal plan",
    "Count calories for my meal",
    "Make a recipe using my ingredients",
    "Vegetarian high protein ideas",
    "Low-carb dinner options",
  ];

  /* ---------------------------- UI ----------------------------- */

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans">
      <main className="max-w-6xl mx-auto grid grid-cols-12 gap-8 px-6 py-8">

        {/* ---------------- LEFT SIDEBAR ---------------- */}
        <aside className="hidden md:flex col-span-3 flex-col gap-6">
          
          {/* Brand Card (Apple-like minimalism) */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">
                🥗
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800 tracking-tight">
                  NutriBuddy
                </h2>
                <p className="text-xs text-slate-500">Smart Nutrition Assistant</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" size="sm">
                <Plus className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={clearChat}>
                <Eraser className="size-4" />
              </Button>
            </div>
          </div>

          {/* Quick Prompts */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-200">
            <p className="text-sm font-medium text-slate-600 mb-3">Quick prompts</p>
            <div className="flex flex-col gap-2">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => form.setValue("message", p)}
                  className="px-4 py-2 rounded-xl bg-[#F3F7F3] hover:bg-[#E8EFE8] text-[#2F7A4C] text-left transition-all duration-200"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Plans */}
          <div className="bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-200">
            <p className="text-sm font-medium text-slate-600 mb-3">Saved plans</p>
            <div className="flex flex-col gap-2 text-sm text-slate-700">
              <div className="px-4 py-2 border rounded-xl bg-white">
                Vegetarian • 1800 kcal
              </div>
              <div className="px-4 py-2 border rounded-xl bg-white">
                Low-carb • 1500 kcal
              </div>
            </div>
          </div>

        </aside>

        {/* ---------------- CHAT MAIN ---------------- */}
        <section className="col-span-12 md:col-span-6 bg-white rounded-3xl shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-slate-200 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 backdrop-blur-xl bg-white/60">
            <ChatHeader>
              <ChatHeaderBlock />
              <ChatHeaderBlock className="justify-center items-center">
                <Avatar className="size-9">
                  <AvatarImage src="/logo.png" />
                  <AvatarFallback>
                    <Image src="/logo.png" alt="logo" width={36} height={36} />
                  </AvatarFallback>
                </Avatar>
                <p className="text-slate-700 font-medium">Chat with {AI_NAME}</p>
              </ChatHeaderBlock>

              <ChatHeaderBlock className="justify-end">
                <Button variant="outline" size="sm" onClick={clearChat}>
                  <PlusIcon className="size-4 mr-2" />
                  {CLEAR_CHAT_TEXT}
                </Button>
              </ChatHeaderBlock>
            </ChatHeader>
          </div>

          {/* Messages */}
          <div className="flex-1 px-6 py-6 overflow-y-auto bg-[#FAFAFA]">
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              
              <MessageWall
                messages={messages}
                status={status}
                durations={durations}
                onDurationChange={(k: any, v: any) =>
                  setDurations({ ...durations, [k]: v })
                }
              />

              {isTyping && (
                <div className="text-sm text-slate-500 px-3 py-2 bg-slate-100 w-fit rounded-xl animate-pulse">
                  NutriBuddy is typing…
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="px-6 py-4 border-t border-slate-200 bg-white/70 backdrop-blur-lg">
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <FieldGroup>
                <Controller
                  name="message"
                  control={form.control}
                  render={({ field }) => (
                    <Field className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Input
                          {...field}
                          className="h-14 rounded-full px-6 border border-slate-200 shadow-sm bg-white text-[15px]"
                          placeholder="Type your message..."
                        />

                        {(status === "ready" || status === "error") && (
                          <Button
                            type="submit"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#2F7A4C] hover:bg-[#25633E] rounded-full"
                            disabled={!field.value.trim()}
                          >
                            <ArrowUp className="size-5 text-white" />
                          </Button>
                        )}

                        {(status === "streaming" || status === "submitted") && (
                          <Button
                            type="button"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-200 rounded-full"
                            onClick={() => stop()}
                          >
                            <Square className="size-5 text-slate-600" />
                          </Button>
                        )}
                      </div>
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>

            {/* Prompt Chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {["Meal plan", "Calories", "Recipe", "Veg", "Keto"].map((chip) => (
                <button
                  key={chip}
                  onClick={() => form.setValue("message", chip)}
                  className="px-4 py-1 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* RIGHT PANE (optional) */}
        <aside className="hidden md:flex col-span-3"></aside>
      </main>
    </div>
  );
}
