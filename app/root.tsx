import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="color-scheme"
          content="light dark"
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem("color-scheme");if(s==="light"||s==="dark"){document.querySelector('meta[name="color-scheme"]').content=s;}}catch(e){}`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "發生錯誤";
  let details = "系統發生非預期的錯誤，請稍後再試。";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404 找不到頁面" : `HTTP ${error.status}`;
    details =
      error.status === 404
        ? "您所尋找的頁面或考卷不存在。"
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto max-w-3xl p-6 pt-16">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/60 dark:bg-red-950/40">
        <h1 className="text-xl font-bold text-red-700 dark:text-red-400">
          {message}
        </h1>
        <p className="mt-2 text-sm text-red-600 dark:text-red-300">{details}</p>
        {stack && (
          <pre className="mt-4 w-full overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100 dark:border dark:border-slate-800">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
