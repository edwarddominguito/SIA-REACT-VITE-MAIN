import React from "react";

export default function UIFeedback({ toasts, closeToast, confirmState, cancelConfirm, confirm }) {
  return (
    <>
      <div className="ui-toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <article key={toast.id} className={`ui-toast ${toast.type}`}>
            <div className="ui-toast-text">{toast.message}</div>
            <button type="button" className="ui-toast-close" onClick={() => closeToast(toast.id)} aria-label="Close notification">
              <i className="bi bi-x"></i>
            </button>
          </article>
        ))}
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
