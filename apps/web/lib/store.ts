"use client";

import { create } from "zustand";
import {
  bestLine,
  getUnderlying,
  wrapperList,
  type AgentBeat,
  type AgentFill,
  type ArmedStrategy,
  type FridayPrint,
  type Job,
  type QueuedIntent,
  type Rail,
  type RailBook,
  type Settings,
  type Side,
  type TapeRow,
  type VenueQuote,
} from "@parallax/core";
import type { BalanceReport, PrepareResult } from "@parallax/web3";

export interface DeskSession {
  atmosphere: "open" | "closed";
  chip: string;
  kind: string;
  label: string;
  countdownMs: number;
  et?: { hour: number; minute: number; weekday: number; ymd: string };
}

export interface Candle {
  t: number;
  c: number;
}

interface ConfirmDraft {
  quote: VenueQuote;
  side: Side;
  usdt: string;
  requestId: string;
  preparing: boolean;
  result: PrepareResult | null;
  note?: string;
  actor: "user" | "agent";
}

interface ParallaxState {
  ticker: string;
  usdt: string;
  sizeChosen: boolean;
  side: Side;
  books: RailBook[];
  best: RailBook | null;
  fridayClose: number | null;
  fridayDate: string | null;
  fridayOpen: number | null;
  priorClose: number | null;
  priorOpen: number | null;
  priorDate: string | null;
  sessionOpen: number | null;
  sessionOpenDate: string | null;
  quoting: boolean;
  quoteError?: string;
  quoteAt: number;
  lockedRail?: Rail;
  session?: DeskSession;
  settings?: Settings;
  spentToday: number;
  jobs: Job[];
  tape: TapeRow[];
  beat?: AgentBeat;
  studio: { live: boolean; address: string };
  queue: QueuedIntent[];
  friday?: FridayPrint | null;
  portfolio?: BalanceReport | null;
  brief: string[];
  settingsOpen: boolean;
  view: "trade" | "jobs" | "wallet";
  command: string;
  confirm: ConfirmDraft | null;
  candles: Candle[];
  candleAddress?: string;
  livePrint: number | null;
  liveSymbol: string;
  marketOpen: boolean | null;
  stockReference: number | null;
  armed: ArmedStrategy[];
  workerEnabled: boolean;
  fills: AgentFill[];
  wallet?: `0x${string}`;
  setWallet: (wallet?: `0x${string}`) => void;
  setCommand: (command: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setView: (view: "trade" | "jobs" | "wallet") => void;
  setUsdt: (usdt: string) => void;
  selectTicker: (ticker: string, rail?: Rail, side?: Side) => Promise<void>;
  refreshQuote: () => Promise<void>;
  refreshDesk: () => Promise<void>;
  lockRail: (rail: Rail) => void;
  openConfirm: (book: RailBook, side: Side, actor?: "user" | "agent") => Promise<void>;
  signQueued: (item: QueuedIntent) => Promise<void>;
  requoteConfirm: () => Promise<void>;
  closeConfirm: () => void;
  setConfirmResult: (result: PrepareResult | null, note?: string) => void;
  saveSettings: (settings: Settings) => Promise<string | null>;
  saveJob: (job: Job) => Promise<void>;
  pauseJob: (id: string, paused: boolean) => Promise<void>;
  pushTape: (row: TapeRow) => Promise<void>;
  loadCandles: (address: string) => Promise<void>;
}

let settingsEpoch = 0;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export const useParallax = create<ParallaxState>((set, get) => ({
  ticker: "NVDA",
  usdt: "10",
  sizeChosen: false,
  side: "buy",
  books: [],
  best: null,
  fridayClose: null,
  fridayDate: null,
  fridayOpen: null,
  priorClose: null,
  priorOpen: null,
  priorDate: null,
  sessionOpen: null,
  sessionOpenDate: null,
  quoting: false,
  quoteAt: 0,
  jobs: [],
  tape: [],
  studio: { live: false, address: "" },
  queue: [],
  brief: [],
  settingsOpen: false,
  spentToday: 0,
  view: "trade",
  command: "",
  confirm: null,
  candles: [],
  livePrint: null,
  liveSymbol: "",
  marketOpen: null,
  stockReference: null,
  armed: [],
  workerEnabled: true,
  fills: [],
  setWallet: (wallet) => set({ wallet }),
  setCommand: (command) => set({ command }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setView: (view) => set({ view }),
  setUsdt: (usdt) => set({ usdt, sizeChosen: true }),
  selectTicker: async (ticker, rail, side) => {
    set({ ticker, lockedRail: rail, side: side || get().side });
    await get().refreshQuote();
  },
  refreshQuote: async () => {
    const { ticker, usdt, side, wallet, lockedRail } = get();
    set({ quoting: true, quoteError: undefined });
    const res = await post<{
      ok: boolean;
      message?: string;
      book?: {
        books: RailBook[];
        best: RailBook | null;
        fridayClose: number | null;
        fridayDate: string | null;
        fridayOpen?: number | null;
        priorClose?: number | null;
        priorOpen?: number | null;
        priorDate?: string | null;
        sessionOpen?: number | null;
        sessionOpenDate?: string | null;
        underlying: { ticker: string };
      };
    }>("/api/quote", { ticker, usdt, side, wallet, railLock: lockedRail });
    if (!res.ok || !res.book) {
      set({ quoting: false, quoteError: res.message || "Quote failed", books: [], best: null });
      return;
    }
    set({
      quoting: false,
      books: res.book.books,
      best: res.book.best,
      fridayClose: res.book.fridayClose,
      fridayDate: res.book.fridayDate,
      fridayOpen: res.book.fridayOpen ?? null,
      priorClose: res.book.priorClose ?? null,
      priorOpen: res.book.priorOpen ?? null,
      priorDate: res.book.priorDate ?? null,
      sessionOpen: res.book.sessionOpen ?? null,
      sessionOpenDate: res.book.sessionOpenDate ?? null,
      quoteAt: Date.now(),
      ticker: res.book.underlying.ticker,
    });
    const active = res.book.books.find((book) => book.wrapper.rail === get().lockedRail) || res.book.best;
    if (active) void get().loadCandles(active.wrapper.address);
  },
  refreshDesk: async () => {
    const { wallet, ticker } = get();
    const epoch = settingsEpoch;
    const params = new URLSearchParams({ ticker });
    if (wallet) params.set("wallet", wallet);
    const res = await fetch(`/api/desk?${params.toString()}`);
    const body = (await res.json()) as {
      ok: boolean;
      session?: DeskSession;
      settings?: Settings;
      spentToday?: number;
      jobs?: Job[];
      tape?: TapeRow[];
      beat?: AgentBeat;
      studio?: { live: boolean; address: string };
      queue?: QueuedIntent[];
      friday?: FridayPrint | null;
      portfolio?: BalanceReport | null;
      brief?: string[];
      live?: { perShare: number | null; symbol: string; isMarketOpen: boolean; stockPrice: number | null } | null;
      armed?: ArmedStrategy[];
      workerEnabled?: boolean;
      fills?: AgentFill[];
    };
    if (!body.ok) return;
    const root = document.documentElement;
    if (body.session?.atmosphere) root.dataset.session = body.session.atmosphere;
    set({
      session: body.session,
      settings: epoch === settingsEpoch ? body.settings : get().settings,
      spentToday: body.spentToday ?? get().spentToday,
      jobs: body.jobs || [],
      tape: body.tape || [],
      beat: body.beat,
      studio: body.studio || { live: false, address: "" },
      queue: body.queue || [],
      friday: body.friday,
      portfolio: body.portfolio,
      brief: body.brief || [],
      fridayClose: body.friday?.close ?? get().fridayClose,
      fridayDate: body.friday?.sessionDate ?? get().fridayDate,
      fridayOpen: body.friday?.open ?? get().fridayOpen,
      priorClose: body.friday?.priorClose ?? get().priorClose,
      priorOpen: body.friday?.priorOpen ?? get().priorOpen,
      priorDate: body.friday?.priorDate ?? get().priorDate,
      sessionOpen: body.friday?.sessionOpen ?? get().sessionOpen,
      sessionOpenDate: body.friday?.sessionOpenDate ?? get().sessionOpenDate,
      livePrint: body.live?.perShare ?? null,
      liveSymbol: body.live?.symbol || "",
      marketOpen: body.live ? body.live.isMarketOpen : null,
      stockReference: body.live?.stockPrice ?? null,
      armed: body.armed || [],
      workerEnabled: body.workerEnabled !== false,
      fills: body.fills || [],
    });
    const underlying = getUnderlying(get().ticker);
    const wrappers = underlying ? wrapperList(underlying) : [];
    const preferred = wrappers.find((item) => item.rail === (get().lockedRail || "bStock")) || wrappers[0];
    if (preferred && get().candleAddress !== preferred.address) void get().loadCandles(preferred.address);
  },
  signQueued: async (item) => {
    const rail = item.railLock;
    set({ ticker: item.ticker, usdt: item.usdt, sizeChosen: true, side: item.side, lockedRail: rail, quoteError: undefined });
    await get().refreshQuote();
    const state = get();
    const book = rail ? state.books.find((row) => row.wrapper.rail === rail) : state.best;
    if (!book?.best?.ok) {
      set({ quoteError: book?.errorText || `${item.ticker} has no open rail to sign.` });
      return;
    }
    await get().openConfirm(book, item.side, "agent");
    const ready = get().confirm?.result;
    const step = ready && "step" in ready ? ready.step : null;
    if (!get().wallet || step === "rejected" || step === "expired" || !step) return;
    await post("/api/queue", { id: item.id });
    set({ queue: get().queue.filter((row) => row.id !== item.id) });
  },
  lockRail: (rail) => {
    set({ lockedRail: rail });
    const book = get().books.find((item) => item.wrapper.rail === rail);
    if (book) void get().loadCandles(book.wrapper.address);
  },
  openConfirm: async (book, side, actor = "user") => {
    const quote = book.best;
    const wallet = get().wallet;
    if (!quote?.ok || !wallet) {
      set({
        confirm: quote
          ? {
              quote,
              side,
              usdt: get().usdt,
              requestId: crypto.randomUUID(),
              preparing: false,
              result: null,
              actor,
              note: "Connect Binance Web3 Wallet. You will sign. We never hold keys.",
            }
          : null,
      });
      return;
    }
    const draft: ConfirmDraft = {
      quote,
      side,
      usdt: get().usdt,
      requestId: crypto.randomUUID(),
      preparing: true,
      result: null,
      actor,
    };
    set({ confirm: draft, side, lockedRail: book.wrapper.rail });
    const res = await post<PrepareResult & { ok: boolean; message?: string }>("/api/prepare", {
      intent: {
        ticker: get().ticker,
        side,
        usdt: get().usdt,
        railLock: book.wrapper.rail,
        vendorLock: quote.vendorName,
        wallet,
        actor,
      },
      quote,
    });
    set({ confirm: { ...draft, preparing: false, result: res, note: res.message } });
  },
  requoteConfirm: async () => {
    const current = get().confirm;
    if (!current) return;
    set({ confirm: { ...current, preparing: true, note: undefined } });
    await get().refreshQuote();
    const book = get().books.find((item) => item.wrapper.rail === current.quote.wrapper.rail);
    const quote = book?.routes.find((route) => route.ok && route.vendorName === current.quote.vendorName) || book?.best;
    if (!quote?.ok || !get().wallet) {
      set({
        confirm: {
          ...current,
          preparing: false,
          quote: quote || current.quote,
          result: null,
          note: quote?.errorText || "That price is 30 seconds old. Requote.",
        },
      });
      return;
    }
    const res = await post<PrepareResult & { message?: string }>("/api/prepare", {
      intent: {
        ticker: get().ticker,
        side: current.side,
        usdt: current.usdt,
        railLock: quote.wrapper.rail,
        vendorLock: current.quote.vendorName,
        wallet: get().wallet,
        actor: current.actor,
      },
      quote,
    });
    set({
      confirm: {
        ...current,
        quote,
        preparing: false,
        result: res,
        note: "message" in res ? res.message : undefined,
        requestId: current.requestId,
      },
    });
  },
  closeConfirm: () => set({ confirm: null }),
  setConfirmResult: (result, note) => {
    const current = get().confirm;
    if (!current) return;
    set({ confirm: { ...current, result, note, preparing: false } });
  },
  saveSettings: async (settings) => {
    const epoch = ++settingsEpoch;
    const res = await post<{ ok: boolean; settings?: Settings; message?: string }>("/api/settings", settings);
    if (!res.ok || !res.settings) return res.message || "Could not save settings.";
    if (epoch === settingsEpoch) set({ settings: res.settings });
    return null;
  },
  saveJob: async (job) => {
    const res = await post<{ jobs: Job[] }>("/api/jobs", { action: "create", job });
    set({ jobs: res.jobs || [] });
  },
  pauseJob: async (id, paused) => {
    const res = await post<{ jobs: Job[] }>("/api/jobs", { action: "pause", id, paused });
    set({ jobs: res.jobs || [] });
  },
  pushTape: async (row) => {
    const res = await post<{ tape: TapeRow[] }>("/api/tape", row);
    set({ tape: res.tape || [row, ...get().tape].slice(0, 30) });
  },
  loadCandles: async (address) => {
    const res = await fetch(`/api/kline?address=${address}`);
    const body = (await res.json()) as { ok: boolean; candles?: Candle[]; message?: string };
    if (body.ok) set({ candles: body.candles || [], candleAddress: address });
  },
}));

export function activeBook(state: Pick<ParallaxState, "books" | "best" | "lockedRail">): RailBook | null {
  if (state.lockedRail) return state.books.find((book) => book.wrapper.rail === state.lockedRail) || state.best;
  return state.best;
}

export function underlyingName(ticker: string): string {
  return getUnderlying(ticker)?.name || ticker;
}

export function executableLine(book: RailBook | null, best: RailBook | null): string | null {
  if (!book?.best) return null;
  if (best && book.wrapper.rail === best.wrapper.rail) return bestLine(book);
  const vendor = book.best.vendorName || book.badge;
  return `LOCKED → ${book.wrapper.symbol} · ${vendor}`;
}
