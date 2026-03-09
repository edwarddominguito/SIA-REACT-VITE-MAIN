import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getCurrentUser, safeArray } from "../lib/storage.js";
import { withImage, money, applyPropertyImageFallback } from "../lib/dashboardUtils.js";

export default function PublicPropertyDetails() {
  const params = useParams();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const property = useMemo(
    () => safeArray("allProperties").find((x) => String(x.id) === String(params.id)),
    [params.id]
  );
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(user ? "/dashboard" : "/");
  };
  const handleImageError = (event) => {
    applyPropertyImageFallback(event.currentTarget, property || {});
  };

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-wrap">
          <div className="public-brand">
            <i className="bi bi-buildings"></i>
            <strong>RealEstate Pro</strong>
          </div>
          <div className="public-actions">
            {user ? (
              <button type="button" className="btn btn-dark btn-sm" onClick={goBack}>Back</button>
            ) : (
              <>
                <button type="button" className="btn btn-outline-dark btn-sm" onClick={goBack}>Back</button>
                <Link className="btn btn-dark btn-sm" to="/login">Login</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="public-wrap">
        {!property ? (
          <section className="agent-empty large">
            <i className="bi bi-exclamation-circle"></i>
            <p>Property not found.</p>
          </section>
        ) : (
          <section className="public-details-grid">
            <img className="public-details-image" src={withImage(property)} alt={property.title || "Property"} onError={handleImageError} />
            <article className="public-details-body">
              <h1>{property.title || "Property"}</h1>
              <p className="muted mb-2"><i className="bi bi-geo-alt"></i> {property.location || "-"}</p>
              <div className="public-price mb-3">PHP {money(property.price)}</div>
              <div className="small mb-1">Bedrooms: {property.bedrooms || "-"}</div>
              <div className="small mb-1">Bathrooms: {property.bathrooms || "-"}</div>
              <div className="small mb-3">Area (sqft): {property.areaSqft || "-"}</div>
              <p>{property.description || "No description available."}</p>
              {!user && (
                <div className="public-cta-row">
                  <Link className="btn btn-dark btn-sm" to="/register">Register to Book</Link>
                </div>
              )}
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
