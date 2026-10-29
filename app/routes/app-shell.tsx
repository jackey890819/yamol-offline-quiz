import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  BookOpen,
  Download,
  FolderOpen,
  History,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import type { Route } from "./+types/app-shell";
import { ThemeToggle } from "~/components/ThemeToggle";
import { countQuizHistoryRecords } from "~/services/quizHistory.server";
import { listLocalExams } from "~/services/yamolCrawler.server";
import styles from "~/styles/app-shell.module.css";

export interface AppShellOutletContext {
  setQuizFocusMode: (focused: boolean) => void;
}

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";
const sidebarListeners = new Set<() => void>();

function getSidebarCollapsedSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSidebarCollapsedSnapshot(): boolean {
  return false;
}

function subscribeSidebarCollapsed(callback: () => void) {
  sidebarListeners.add(callback);
  if (typeof window === "undefined") {
    return () => {
      sidebarListeners.delete(callback);
    };
  }
  const handleStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_STORAGE_KEY || e.key === null) {
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function setSidebarCollapsedPreference(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "true" : "false");
  } catch {
    // ignore storage errors
  }
  for (const listener of sidebarListeners) {
    listener();
  }
}

export async function loader() {
  const [exams, historyCount] = await Promise.all([
    listLocalExams(),
    countQuizHistoryRecords(),
  ]);
  return {
    examCount: exams.length,
    historyCount,
  };
}

export default function AppShell({ loaderData }: Route.ComponentProps) {
  const { examCount, historyCount } = loaderData;
  const location = useLocation();
  const drawerId = useId();

  const isSidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getServerSidebarCollapsedSnapshot
  );

  const [quizFocusMode, setQuizFocusMode] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const isOpenPendingRef = useRef(false);

  const pathname = location.pathname;
  const isQuizRoute = /^\/exams\/[^/]+\/quiz\/?$/.test(pathname);
  const isExamDetailRoute = /^\/exams\/[^/]+\/?$/.test(pathname);
  const effectiveFocusMode = isQuizRoute && quizFocusMode;

  const navItems = [
    {
      to: "/",
      label: "本地題庫",
      description: "瀏覽與管理已下載考卷",
      icon: FolderOpen,
      badge: examCount > 0 ? String(examCount) : undefined,
      isActive: pathname === "/" || pathname.startsWith("/exams/"),
    },
    {
      to: "/history",
      label: "歷史測驗紀錄",
      description: "成績趨勢與錯題回顧",
      icon: History,
      badge: historyCount > 0 ? String(historyCount) : undefined,
      isActive: pathname === "/history" || pathname.startsWith("/history/"),
    },
    {
      to: "/import",
      label: "匯入與探索考卷",
      description: "從阿摩探索並離線下載",
      icon: Download,
      badge: undefined,
      isActive: pathname === "/import",
    },
  ];

  const currentMobileTitle = pathname.startsWith("/history")
    ? "歷史測驗紀錄"
    : pathname === "/import"
      ? "匯入與探索考卷"
      : pathname.startsWith("/exams/")
        ? isQuizRoute
          ? "刷題與模擬測驗"
          : "考卷閱覽"
        : "本地題庫管理";

  const openDrawer = useCallback(async () => {
    const drawer = drawerRef.current;
    const scroller = scrollerRef.current;
    if (!drawer || !scroller) return;

    isOpenPendingRef.current = true;
    drawer.classList.add(styles.drawerVisible!);

    if (
      typeof CSS === "undefined" ||
      !CSS.supports("scroll-initial-target", "nearest")
    ) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "instant" });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    }

    scroller.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  const closeDrawer = useCallback(() => {
    const drawer = drawerRef.current;
    const scroller = scrollerRef.current;
    if (!drawer || !scroller) return;
    if (!drawer.classList.contains(styles.drawerVisible!)) return;

    isOpenPendingRef.current = false;
    scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
  }, []);

  // Scroll-snap 抽屜開關狀態偵測 (IntersectionObserver) 與不支援 animation-timeline 的降級處理
  useEffect(() => {
    if (typeof window === "undefined") return;
    const drawer = drawerRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    const contentWrapper = contentWrapperRef.current;
    if (!drawer || !scroller || !sheet) return;

    const visibleThreshold = Math.min(0.05, 2 / Math.max(window.innerWidth, 1));

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;

        if (entry.intersectionRatio >= 0.98) {
          isOpenPendingRef.current = false;
          if (contentWrapper) {
            contentWrapper.inert = true;
          }
          setIsDrawerExpanded(true);
          sheet.focus({ preventScroll: true });
        } else if (
          entry.intersectionRatio < visibleThreshold &&
          !isOpenPendingRef.current
        ) {
          drawer.classList.remove(styles.drawerVisible!);
          if (contentWrapper) {
            contentWrapper.inert = false;
          }
          setIsDrawerExpanded(false);
        }
      },
      { root: drawer, threshold: [visibleThreshold, 0.98] }
    );

    observer.observe(sheet);

    let cleanupScrollFallback: (() => void) | undefined;
    if (
      typeof CSS === "undefined" ||
      !CSS.supports("animation-timeline: scroll()")
    ) {
      const handleScroll = () => {
        const width = sheet.offsetWidth || 1;
        const ratio = Math.max(0, Math.min(1, 1 - scroller.scrollLeft / width));
        drawer.style.setProperty("--drawer-backdrop", String(ratio));
      };
      scroller.addEventListener("scroll", handleScroll, { passive: true });
      cleanupScrollFallback = () =>
        scroller.removeEventListener("scroll", handleScroll);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        drawer.classList.contains(styles.drawerVisible!)
      ) {
        closeDrawer();
      }
    };

    const handleResize = () => {
      if (
        window.innerWidth >= 1024 &&
        drawer.classList.contains(styles.drawerVisible!)
      ) {
        drawer.classList.remove(styles.drawerVisible!);
        if (contentWrapper) {
          contentWrapper.inert = false;
        }
        setIsDrawerExpanded(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      cleanupScrollFallback?.();
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      if (contentWrapper) {
        contentWrapper.inert = false;
      }
    };
  }, [closeDrawer]);

  // 路由切換或進入專注模式時，確保行動版抽屜關閉並解除 inert
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (drawer.classList.contains(styles.drawerVisible!)) {
      isOpenPendingRef.current = false;
      drawer.classList.remove(styles.drawerVisible!);
      if (contentWrapperRef.current) {
        contentWrapperRef.current.inert = false;
      }
    }
  }, [pathname, effectiveFocusMode]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* 行動版側滑導覽抽屜 (預設隱藏，支援手指滑動關閉、點擊遮罩關閉與 Esc 關閉) */}
      <div
        id={drawerId}
        ref={drawerRef}
        onClick={(e) => {
          if (
            sheetRef.current &&
            !sheetRef.current.contains(e.target as Node)
          ) {
            closeDrawer();
          }
        }}
        className={`${styles.drawer} lg:hidden`}
      >
        <div className={styles.drawerBackdrop} aria-hidden="true" />
        <div ref={scrollerRef} className={styles.drawerScroller}>
          <nav
            ref={sheetRef}
            tabIndex={-1}
            aria-label="行動版主功能選單"
            className={`${styles.drawerSheet} border-r border-slate-200 bg-white text-slate-900 shadow-2xl focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
          >
            {/* 抽屜頂部品牌與關閉按鈕 */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <Link
                to="/"
                onClick={closeDrawer}
                className="flex items-center gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-2xs">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                    阿摩離線刷題系統
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    題庫管理與測驗中心
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={closeDrawer}
                aria-label="關閉功能選單"
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* 抽屜導覽清單 */}
            <ul className="space-y-1.5 p-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={closeDrawer}
                      aria-current={item.isActive ? "page" : undefined}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${
                        item.isActive
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-5 w-5 shrink-0 ${
                            item.isActive
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-slate-400 dark:text-slate-500"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <span className="block">{item.label}</span>
                          <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            {item.description}
                          </span>
                        </div>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            item.isActive
                              ? "bg-indigo-600 text-white dark:bg-indigo-500"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* 抽屜底部主題設定 */}
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                介面外觀主題
              </span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </div>

      {/* 主版面容器：電腦版左側可收合欄 + 右側主內容區 */}
      <div
        ref={contentWrapperRef}
        className="flex min-h-screen flex-col lg:flex-row"
      >
        {/* 電腦版左側固定／可收合側邊欄（作答專注模式時自動隱藏） */}
        {!effectiveFocusMode && (
          <aside
            aria-label="主功能導覽列"
            className={`hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col dark:border-slate-800 dark:bg-slate-900 ${
              isSidebarCollapsed ? "w-[72px]" : "w-64"
            }`}
          >
            {/* 品牌標頭與收合切換按鈕 */}
            <div
              className={`flex h-16 items-center border-b border-slate-200 dark:border-slate-800 ${
                isSidebarCollapsed
                  ? "justify-center px-2"
                  : "justify-between gap-2 px-4"
              }`}
            >
              {!isSidebarCollapsed && (
                <Link to="/" className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-2xs">
                    <BookOpen className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                      阿摩離線題庫
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      刷題與錯題管理
                    </span>
                  </div>
                </Link>
              )}

              <button
                type="button"
                onClick={() =>
                  setSidebarCollapsedPreference(!isSidebarCollapsed)
                }
                title={isSidebarCollapsed ? "展開側邊選單" : "收合側邊選單"}
                aria-label={
                  isSidebarCollapsed ? "展開側邊選單" : "收合側邊選單"
                }
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="h-4.5 w-4.5" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* 電腦版導覽選單項目 */}
            <nav
              aria-label="系統主要頁面"
              className="flex-1 overflow-y-auto p-3"
            >
              <ul className="space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  if (isSidebarCollapsed) {
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          title={
                            item.badge
                              ? `${item.label} (${item.badge})`
                              : item.label
                          }
                          aria-label={item.label}
                          aria-current={item.isActive ? "page" : undefined}
                          className={`relative flex h-11 w-full items-center justify-center rounded-xl transition ${
                            item.isActive
                              ? "bg-indigo-600 text-white shadow-2xs"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          }`}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                          {item.badge && (
                            <span
                              className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                                item.isActive
                                  ? "bg-amber-400 text-slate-950"
                                  : "bg-indigo-600 text-white dark:bg-indigo-500"
                              }`}
                            >
                              {Number(item.badge) > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        aria-current={item.isActive ? "page" : undefined}
                        className={`flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          item.isActive
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon
                            className={`h-4.5 w-4.5 shrink-0 ${
                              item.isActive
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                              item.isActive
                                ? "bg-indigo-600 text-white dark:bg-indigo-500"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* 電腦版底部工具區 */}
            <div
              className={`border-t border-slate-200 p-3 dark:border-slate-800 ${
                isSidebarCollapsed ? "flex justify-center" : "space-y-2"
              }`}
            >
              {isSidebarCollapsed ? (
                <ThemeToggle compact />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="px-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    介面主題
                  </span>
                  <ThemeToggle />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* 行動版頂部導覽列（電腦版與刷題作答專注模式隱藏） */}
        {!effectiveFocusMode && (
          <header
            className={`border-b border-slate-200 bg-white/95 backdrop-blur-xs lg:hidden dark:border-slate-800 dark:bg-slate-900/95 ${
              isExamDetailRoute ? "" : "sticky top-0 z-30"
            }`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void openDrawer()}
                  aria-label="開啟功能選單"
                  aria-expanded={isDrawerExpanded}
                  aria-controls={drawerId}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Menu className="h-4.5 w-4.5" aria-hidden="true" />
                </button>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                    {currentMobileTitle}
                  </span>
                </div>
              </div>

              <ThemeToggle compact />
            </div>
          </header>
        )}

        {/* 右側主頁面內容區 */}
        <div className="min-w-0 flex-1">
          <Outlet
            context={{ setQuizFocusMode } satisfies AppShellOutletContext}
          />
        </div>
      </div>
    </div>
  );
}
