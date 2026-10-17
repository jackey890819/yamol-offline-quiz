import { useEffect, useId, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import styles from "~/styles/exam-viewer.module.css";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "確定",
  cancelLabel = "取消",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Fallback for browsers without native <dialog closedby="any"> support
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };
    dialog.addEventListener("close", handleClose);

    let handleBackdropClick: ((event: MouseEvent) => void) | undefined;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener("click", handleBackdropClick);
      }
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      className={`${styles.modalDialog} m-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                variant === "danger"
                  ? "bg-red-100 text-red-600"
                  : "bg-indigo-100 text-indigo-600"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="關閉視窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {description}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => dialogRef.current?.close()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-xs transition disabled:opacity-50 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isLoading ? "處理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
