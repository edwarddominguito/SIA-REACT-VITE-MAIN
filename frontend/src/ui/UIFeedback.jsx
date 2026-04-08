const TOAST_META = {
  info: {
    icon: "bi-info-circle-fill",
    label: "Notice"
  },
  success: {
    icon: "bi-check-circle-fill",
    label: "Success"
  },
  error: {
    icon: "bi-exclamation-circle-fill",
    label: "Check Input"
  }
};

export default function UIFeedback({
  toasts,
  closeToast,
  confirmState,
  cancelConfirm,
  confirm,
  toastPlacement = "top-center"
}) {
  const placementClass =
    toastPlacement === "corner"
      ? "ui-toast-stack-corner"
      : toastPlacement === "dashboard-top"
        ? "ui-toast-stack-dashboard-top"
      : toastPlacement === "modal-center"
        ? "ui-toast-stack-modal-center"
      : toastPlacement === "modal-top"
        ? "ui-toast-stack-modal-top"
      : toastPlacement === "center"
        ? "ui-toast-stack-center"
        : "ui-toast-stack-top-center";

  return (
    <>
      <div
        className={`ui-toast-stack ${placementClass}`.trim()}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const meta = TOAST_META[toast.type] || TOAST_META.info;
          return (
            <article key={toast.id} className={`ui-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
              <div className={`ui-toast-icon ${toast.type}`} aria-hidden="true">
                <i className={`bi ${meta.icon}`}></i>
              </div>
              <div className="ui-toast-copy">
                <span className="ui-toast-label">{meta.label}</span>
                <div className="ui-toast-text">{toast.message}</div>
              </div>
              <button type="button" className="ui-toast-close" onClick={() => closeToast(toast.id)} aria-label="Close notification">
                <i className="bi bi-x"></i>
              </button>
            </article>
          );
        })}
      </div>

      {confirmState && (
        <div className="ui-confirm-overlay" role="dialog" aria-modal="true" aria-label={confirmState.title}>
          <div className="ui-confirm-card">
            <h4>{confirmState.title}</h4>
            <p>{confirmState.message}</p>
            <div className="ui-confirm-actions">
              <button type="button" className="btn btn-outline-dark" onClick={cancelConfirm}>
                {confirmState.cancelText}
              </button>
              <button
                type="button"
                className={`btn ${confirmState.variant === "danger" ? "btn-danger" : "btn-dark"}`}
                onClick={confirm}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
